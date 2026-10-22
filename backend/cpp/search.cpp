#include <pybind11/pybind11.h>
#include <pybind11/numpy.h>
#include <pybind11/stl.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <memory>
#include <random>
#include <stdexcept>
#include <vector>
#ifdef _OPENMP
#include <omp.h>
#endif
namespace py = pybind11;
using Board = std::array<int8_t,81>;

static int components(const Board& b,int n,int color) {
  bool seen[81] = {}; int count=0, stack[81];
  for(int x=0;x<n*n;x++) if(b[x]==color && !seen[x]) {
    count++; int top=0; stack[top++]=x; seen[x]=true;
    while(top) { int a=stack[--top],r=a/n,c=a%n;
      int nb[4]={r? a-n:-1,r+1<n?a+n:-1,c?a-1:-1,c+1<n?a+1:-1};
      for(int y:nb) if(y>=0 && b[y]==color && !seen[y]) {seen[y]=true;stack[top++]=y;}
    }
  } return count;
}
static float terminal_value(const Board& b,int n,int p) {
  int d=components(b,n,p)-components(b,n,3-p); return (d>0)-(d<0);
}
#include "endgame.h"
#include "greedy.h"
struct Prior {int action;float p;};
struct Node;
struct Edge {
  int action; float prior; int visits=0; float sum=0;
  std::unique_ptr<Node> child;
  Edge(int a,float p):action(a),prior(p){}
  Edge(Edge&&) noexcept = default;
  Edge& operator=(Edge&&) noexcept = default;
};
struct Node {
  Board board; int player,empty,visits=0; bool expanded=false,solved=false,root_exact=false;
  float value=0,sum=0,visited_prior=0;
  std::vector<Prior> unopened; size_t next=0;
  std::vector<Edge> edges;
  Node(const Board& b,int p,int e):board(b),player(p),empty(e){}
};
struct PathEntry {Node* node;size_t edge;};
struct Tree {
  std::unique_ptr<Node> root; std::mt19937_64 rng;
  std::vector<PathEntry> path; Node* pending=nullptr;
  int completed=0; bool root_request=false;
  Tree(const Board& b,int p,int e,uint64_t seed):root(new Node(b,p,e)),rng(seed){}
};
class BatchSearch {
  int n,area,budget,threads,exact_limit; float cpuct,noise,alpha,fpu,root_fpu,temperature;
  std::vector<std::unique_ptr<Tree>> trees;
  std::vector<int> pending;
  void backup(Tree& t,float value,bool initial=false) {
    Node* leaf=t.pending;
    if(leaf) {leaf->visits++;leaf->sum+=value;}
    for(auto it=t.path.rbegin();it!=t.path.rend();++it) {
      value=-value; Edge& e=it->node->edges[it->edge];
      e.visits++;e.sum+=value;it->node->visits++;it->node->sum+=value;
    }
    if(!initial) t.completed++;
    t.pending=nullptr;t.path.clear();
  }
  bool walk(Tree& t) {
    if(t.completed>=budget || t.root->empty<2) return false;
    while(t.completed<budget) {
      t.path.clear(); Node* a=t.root.get();
      while(a->expanded && a->empty>=2) {
        // Each exact leaf already proves the backed-up utility. Repeated
        // visits reuse that value and still consume a normal simulation.
        if(a!=t.root.get() && a->solved) break;
        float scale=cpuct*std::sqrt(float(std::max(1,a->visits)));
        float baseline=a->visits ? a->sum/a->visits:a->value;
        float reduction=a==t.root.get()?root_fpu:fpu;
        float first=baseline-reduction*std::sqrt(std::max(0.f,a->visited_prior));
        float best=-1e30f;size_t chosen=0;
        for(size_t j=0;j<a->edges.size();j++) {
          Edge& e=a->edges[j];
          float q=e.visits ? e.sum/e.visits:first;
          float u=q+scale*e.prior/(1+e.visits);
          if(u>best) {best=u;chosen=j;}
        }
        if(a->next<a->unopened.size()) {
          auto candidate=a->unopened[a->next];
          if(a->edges.empty() || first+scale*candidate.p>best) {
            chosen=a->edges.size();a->edges.emplace_back(candidate.action,candidate.p);
            a->visited_prior+=candidate.p;a->next++;
          }
        }
        Edge& e=a->edges[chosen];
        if(!e.child) {Board b=a->board;b[e.action/area]=a->player;b[e.action%area]=3-a->player;
          e.child.reset(new Node(b,3-a->player,a->empty-2));
          if(a==t.root.get() && a->root_exact) {
            // Every exact root action is optimal, proving its child value.
            e.child->expanded=true;e.child->solved=true;e.child->value=-a->value;
          }
        }
        t.path.push_back({a,chosen});a=e.child.get();
      }
      t.pending=a;t.root_request=t.path.empty();
      if(a->solved && !t.root_request) {backup(t,a->value);continue;}
      if(a->empty<2) {backup(t,terminal_value(a->board,n,a->player));continue;}
      if(exact_limit>0 && a->empty<=exact_limit) {
        auto solved=solve_endgame(a->board,n,a->player);
        a->value=solved.value;a->expanded=true;
        a->solved=!t.root_request;a->root_exact=t.root_request;
        float prior=1.f/solved.actions.size();
        for(int action:solved.actions) a->unopened.push_back({action,prior});
        a->edges.reserve(std::min(64,budget));
        // Once solved, explore only equally optimal moves. No neural approximation
        // or root perturbation can override the exact terminal utility.
        backup(t,solved.value,t.root_request);continue;
      }
      return true;
    } return false;
  }
  void expand(Tree& t,const float* logits,float value) {
    Node& node=*t.pending;node.value=value;node.expanded=true;
    std::vector<int> free; for(int i=0;i<area;i++) if(!node.board[i]) free.push_back(i);
    float maximum=-1e30f;float temp=t.root_request?temperature:1.f;
    for(int x:free) for(int y:free) if(x!=y) maximum=std::max(maximum,logits[x*area+y]/temp);
    double total=0;
    node.unopened.reserve(free.size()*(free.size()-1));
    for(int x:free) for(int y:free) if(x!=y) {
      int action=x*area+y;float p=std::exp(std::max(-80.f,logits[action]/temp-maximum));
      node.unopened.push_back({action,p});total+=p;
    }
    for(auto& a:node.unopened) a.p=float(a.p/total);
    if(t.root_request && noise>0) {
      // Fixed total concentration, independent of the 6,480 opening branches.
      std::gamma_distribution<double> gamma(alpha/node.unopened.size(),1.0);
      std::vector<double> random(node.unopened.size());double sum=0;
      for(double& v:random) {v=gamma(t.rng);sum+=v;}
      if(sum>0) for(size_t i=0;i<random.size();i++)
        node.unopened[i].p=(1-noise)*node.unopened[i].p+noise*random[i]/sum;
    }
    // At most 'budget' edges can ever be visited in this search. Keeping those
    // highest priors is exactly equivalent to the full sorted unopened list:
    // a lower-prior unvisited edge has the same FPU and can never be picked first.
    // Normalize over ALL legal actions above, without renormalizing this prefix.
    size_t keep=std::min(node.unopened.size(),size_t(budget));
    auto prior_order=[](const Prior& a,const Prior& b){
      if(a.p!=b.p) return a.p>b.p;return a.action<b.action;};
    if(keep<node.unopened.size())
      std::nth_element(node.unopened.begin(),node.unopened.begin()+keep,node.unopened.end(),prior_order);
    std::sort(node.unopened.begin(),node.unopened.begin()+keep,prior_order);
    node.unopened.resize(keep);
    node.unopened.shrink_to_fit();
    node.edges.reserve(std::min(64,budget));
    backup(t,value,t.root_request);
  }
public:
  BatchSearch(py::array_t<int8_t,py::array::c_style|py::array::forcecast> boards,
              py::array_t<int,py::array::c_style|py::array::forcecast> players,
              int simulations,uint64_t seed,float c,float eps,float concentration,
              float reduction,float root_temperature,int num_threads,int endgame,float root_reduction)
    :budget(simulations),threads(num_threads),exact_limit(endgame),cpuct(c),noise(eps),alpha(concentration),fpu(reduction),
     root_fpu(root_reduction<0?reduction:root_reduction),temperature(root_temperature) {
    auto b=boards.request(),p=players.request();
    if(b.ndim!=2 || p.ndim!=1 || b.shape[0]!=p.shape[0]) throw std::invalid_argument("boards/players shape");
    area=b.shape[1];n=int(std::sqrt(area));
    if(n*n!=area || n%2!=1 || n>9 || budget<1 || c<=0 || eps<0 || eps>1 || concentration<=0 || root_temperature<=0 || threads<1 || endgame<0 || endgame>9)
      throw std::invalid_argument("invalid search configuration");
    if(!std::isfinite(root_reduction) || (root_reduction<0 && root_reduction!=-1) || root_reduction>1)
      throw std::invalid_argument("root FPU reduction must be -1 (inherit) or in [0,1]");
    auto bp=static_cast<int8_t*>(b.ptr);auto pp=static_cast<int*>(p.ptr);
    for(int i=0;i<b.shape[0];i++) {
      Board board={};int empty=0,black=0,white=0;
      for(int j=0;j<area;j++) {int v=bp[i*area+j];if(v<0 || v>2) throw std::invalid_argument("board color");
        board[j]=v;empty+=v==0;black+=v==1;white+=v==2;}
      if(black!=white || pp[i]!=(black%2?2:1)) throw std::invalid_argument("unreachable board/turn");
      trees.emplace_back(new Tree(board,pp[i],empty,seed+i*0x9e3779b97f4a7c15ULL));
    }
  }
  py::array_t<float> request() {
    if(!pending.empty()) throw std::logic_error("submit outstanding evaluations first");
    std::vector<uint8_t> ready(trees.size(),0);
    {py::gil_scoped_release release;
      #pragma omp parallel for num_threads(threads) schedule(dynamic,4)
      for(int i=0;i<(int)trees.size();i++) ready[i]=walk(*trees[i]);
    }
    for(int i=0;i<(int)ready.size();i++) if(ready[i]) pending.push_back(i);
    py::array_t<float> result({int(pending.size()),3,n,n});float* out=result.mutable_data();
    for(int i=0;i<(int)pending.size();i++) {auto& a=*trees[pending[i]]->pending;
      for(int j=0;j<area;j++) {out[(i*3)*area+j]=a.board[j]==a.player;
        out[(i*3+1)*area+j]=a.board[j]==3-a.player;out[(i*3+2)*area+j]=a.board[j]==0;}}
    return result;
  }
  void submit(py::array_t<float,py::array::c_style|py::array::forcecast> logits,
              py::array_t<float,py::array::c_style|py::array::forcecast> values) {
    auto l=logits.request(),v=values.request();
    if(l.ndim!=2 || l.shape[0]!=(int)pending.size() || l.shape[1]!=area*area || v.ndim!=1 || v.shape[0]!=(int)pending.size())
      throw std::invalid_argument("evaluation shapes");
    auto lp=static_cast<float*>(l.ptr);auto vp=static_cast<float*>(v.ptr);
    for(int i=0;i<l.size;i++) if(!std::isfinite(lp[i])) throw std::invalid_argument("non-finite policy");
    for(int i=0;i<v.size;i++) if(!std::isfinite(vp[i]) || std::abs(vp[i])>1.001f) throw std::invalid_argument("non-finite/out-of-range value");
    {py::gil_scoped_release release;
      #pragma omp parallel for num_threads(threads) schedule(dynamic,4)
      for(int i=0;i<(int)pending.size();i++) expand(*trees[pending[i]],lp+i*area*area,vp[i]);
    }
    pending.clear();
  }
  py::list results() const {
    if(!pending.empty()) throw std::logic_error("pending evaluations");
    py::list results;
    for(auto& t:trees) {
      if(t->root->empty>=2 && t->completed<budget) throw std::logic_error("search not complete");
      py::dict result;std::vector<int> actions,visits;std::vector<float> values;
      for(auto& e:t->root->edges) if(e.visits) {actions.push_back(e.action);visits.push_back(e.visits);values.push_back(e.sum/e.visits);}
      result["actions"]=actions;result["visits"]=visits;result["action_values"]=values;result["simulations"]=t->completed;
      result["value"]=t->root->empty<2?terminal_value(t->root->board,n,t->root->player):t->root->sum/std::max(1,t->root->visits);
      results.append(result);
    }return results;
  }
  std::vector<int> pending_indices() const { return pending; }
};
PYBIND11_MODULE(_search,m) {
  py::class_<BatchSearch>(m,"BatchSearch")
    .def(py::init<py::array_t<int8_t,py::array::c_style|py::array::forcecast>,py::array_t<int,py::array::c_style|py::array::forcecast>,int,uint64_t,float,float,float,float,float,int,int,float>(),
      py::arg("boards"),py::arg("players"),py::arg("simulations")=128,py::arg("seed")=1,py::arg("cpuct")=1.5,
      py::arg("noise_fraction")=.25,py::arg("noise_alpha")=10.83,py::arg("fpu_reduction")=.15,py::arg("root_temperature")=1.15,py::arg("threads")=4,py::arg("exact_endgame")=0,
      py::arg("root_fpu_reduction")=-1.f)
    .def("request",&BatchSearch::request).def("submit",&BatchSearch::submit).def("results",&BatchSearch::results)
    .def("pending_indices",&BatchSearch::pending_indices);
  m.def("solve_endgame",[](py::array_t<int8_t,py::array::c_style|py::array::forcecast> arr,int player,int n){
    if(n<1 || n>9 || n%2!=1 || arr.size()!=n*n) throw std::invalid_argument("board shape");
    Board b={};std::copy(arr.data(),arr.data()+arr.size(),b.begin());auto solved=solve_endgame(b,n,player);
    py::dict result;result["value"]=solved.value;result["actions"]=solved.actions;result["positions"]=solved.positions;result["cache_hits"]=solved.cache_hits;return result;
  },py::arg("board"),py::arg("player"),py::arg("n")=9);
  m.def("greedy_actions",[](py::array_t<int8_t,py::array::c_style|py::array::forcecast> arr,int player,int n){
    if(n<1 || n>9 || n%2!=1 || arr.size()!=n*n) throw std::invalid_argument("board shape");
    Board b={};std::copy(arr.data(),arr.data()+arr.size(),b.begin());auto greedy=greedy_actions(b,n,player);
    py::dict result;result["actions"]=greedy.actions;result["best_delta"]=greedy.best_delta;
    result["score_difference"]=greedy.score_difference;return result;
  },py::arg("board"),py::arg("player"),py::arg("n")=9);
  m.def("scores",[](py::array_t<int8_t,py::array::c_style|py::array::forcecast> arr,int n){
    if(n<1 || n>9 || n%2!=1 || arr.size()!=n*n) throw std::invalid_argument("board shape");
    Board b={};std::copy(arr.data(),arr.data()+arr.size(),b.begin());return py::make_tuple(components(b,n,1),components(b,n,2));},py::arg("board"),py::arg("n")=9);
}
