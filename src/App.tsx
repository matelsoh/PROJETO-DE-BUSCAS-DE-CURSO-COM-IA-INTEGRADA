/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import { 
  Search, BookOpen, Star, MessageSquare, Send, X, LogIn, LogOut, 
  User as UserIcon, Bell, Inbox, Heart, Sparkles, Map, 
  ChevronRight, Award, Clock, Terminal, Globe, Brain, Database,
  Cpu, Layout, CheckCircle2, Circle, Loader2, ExternalLink, Share2, Shield, Users, Eye, Info, AlertCircle, Coffee, Youtube
} from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<any, any> {
  public state: any = {
    hasError: false,
    error: null
  };

  constructor(props: any) {
    super(props);
  }

  static getDerivedStateFromError(error: any): any {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    const that = this as any;
    if (that.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-main flex items-center justify-center p-6">
          <div className="glass-card bg-bg-card p-10 max-w-xl w-full text-center border-red-500/30">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mx-auto mb-6">
              <AlertCircle size={40} />
            </div>
            <h2 className="text-3xl font-bold mb-4">Ops! Algo deu errado.</h2>
            <p className="text-text-secondary mb-8 leading-relaxed">
              Encontramos um erro inesperado. Tente recarregar a página ou entre em contato com o suporte se o problema persistir.
            </p>
            <button 
              onClick={() => window.location.reload()} 
              className="btn-primary bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20"
            >
              Recarregar Aplicação
            </button>
            {process.env.NODE_ENV !== 'production' && (
              <div className="mt-8 p-4 bg-black/40 rounded-xl text-left border border-white/5 overflow-auto max-h-40">
                <code className="text-[10px] text-red-400 font-mono whitespace-pre-wrap">
                  {that.state.error?.toString()}
                </code>
              </div>
            )}
          </div>
        </div>
      );
    }

    return that.props.children;
  }
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    }
  }
}

import { motion, AnimatePresence } from 'motion/react';
import { searchCourses, generateRoadmap, generateCourseImage } from './services/geminiService';
import { auth, db, login, logout, handleFirestoreError, OperationType, logSearch, awardXP } from './lib/firebase';
import { 
  CourseResult, RoadmapStep, RatingData, CommentData, UserData, SearchLog, NotificationData, LearningPath 
} from './types';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, query, where, onSnapshot, addDoc, serverTimestamp, 
  orderBy, getDocs, doc, setDoc, updateDoc, arrayUnion, arrayRemove, limit 
} from 'firebase/firestore';

export default function App() {
  const [queryText, setQueryText] = useState('');
  const [courses, setCourses] = useState<CourseResult[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapStep[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingRoadmap, setLoadingRoadmap] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseResult | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string | null>(null);

  // Stats
  const [courseStats, setCourseStats] = useState<Record<string, { avg: number, count: number }>>({});
  const [userProgress, setUserProgress] = useState<Record<string, 'started' | 'completed'>>({});
  const [courseCovers, setCourseCovers] = useState<Record<string, string>>({});
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [selectedPath, setSelectedPath] = useState<LearningPath | null>(null);
  const [view, setView] = useState<'home' | 'paths'>('home');
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubNotify: (() => void) | null = null;
    let unsubProgress: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      
      if (unsubUser) unsubUser();
      if (unsubNotify) unsubNotify();
      if (unsubProgress) unsubProgress();

      if (u) {
        const userRef = doc(db, 'users', u.uid);
        unsubUser = onSnapshot(userRef, (snap) => {
          if (snap.exists()) setUserData(snap.data() as UserData);
        }, (err) => handleFirestoreError(err, OperationType.GET, `users/${u.uid}`));

        await setDoc(userRef, {
          uid: u.uid,
          displayName: u.displayName || 'Dev',
          photoURL: u.photoURL || '',
          email: u.email || '',
          role: 'user',
          lastLogin: serverTimestamp()
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`));

        // Notifications
        const nQuery = query(collection(db, 'notifications'), where('userId', '==', u.uid), orderBy('timestamp', 'desc'), limit(10));
        unsubNotify = onSnapshot(nQuery, (snap) => {
          setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificationData)));
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));

        // Progress
        const pQuery = query(collection(db, 'progress'), where('userId', '==', u.uid));
        unsubProgress = onSnapshot(pQuery, (snap) => {
          const p: Record<string, 'started' | 'completed'> = {};
          snap.docs.forEach(d => {
            const data = d.data();
            p[data.courseUrl] = data.status;
          });
          setUserProgress(p);
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'progress'));
      } else {
        setUserData(null);
        setNotifications([]);
        setUserProgress({});
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUser) unsubUser();
      if (unsubNotify) unsubNotify();
      if (unsubProgress) unsubProgress();
    };
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!queryText.trim()) return;
    setLoading(true);
    setRoadmap(null);
    try {
      const results = await searchCourses(queryText);
      setCourses(results);
      
      // Log search for analytics
      logSearch({
        query: queryText,
        userId: user?.uid,
        resultsCount: results.length,
        timestamp: null // will be set by server
      });

      // Award XP for searching
      if (user) awardXP(user.uid, 5);
    } catch (err) {
      console.error(err);
      setGlobalError("Não foi possível realizar a busca. Tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  };

  const handleRoadmap = async () => {
    if (!queryText.trim()) return;
    setLoadingRoadmap(true);
    try {
      const data = await generateRoadmap(queryText);
      setRoadmap(data);
      // Award XP for exploring career paths
      if (user) awardXP(user.uid, 15);
    } catch (err) {
      console.error(err);
      setGlobalError("Erro ao gerar seu roadmap personalizado.");
    } finally {
      setLoadingRoadmap(false);
    }
  };

  const toggleFavorite = async (courseUrl: string) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const isFav = userData?.favorites?.includes(courseUrl);
    try {
      await updateDoc(userRef, {
        favorites: isFav ? arrayRemove(courseUrl) : arrayUnion(courseUrl)
      });
      if (!isFav) awardXP(user.uid, 5);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const updateProgress = async (courseUrl: string, status: 'started' | 'completed') => {
    if (!user) return;
    const progressId = `${user.uid}_${btoa(courseUrl).slice(0, 50)}`;
    try {
      await setDoc(doc(db, 'progress', progressId), {
        userId: user.uid,
        courseUrl,
        status,
        lastUpdated: serverTimestamp()
      }, { merge: true });
      awardXP(user.uid, status === 'completed' ? 50 : 15);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `progress/${progressId}`);
    }
  };

  const filteredCourses = levelFilter 
    ? courses.filter(c => c.level === levelFilter)
    : courses;

  const categories = [
    { name: "Frontend", icon: <Layout size={18} /> },
    { name: "Backend", icon: <Terminal size={18} /> },
    { name: "Mobile", icon: <Globe size={18} /> },
    { name: "IA & Ciência de Dados", icon: <Brain size={18} /> },
    { name: "Banco de Dados", icon: <Database size={18} /> },
    { name: "Infra & Cloud", icon: <Cpu size={18} /> },
    { name: "YouTube", icon: <Youtube size={18} /> }
  ];

  const featuredPaths: LearningPath[] = [
    {
      id: 'frontend-zero-to-hero',
      title: 'Frontend: Do Zero ao Profissional',
      description: 'Uma sequência lógica para você dominar a arte de criar interfaces modernas e interativas.',
      category: 'Frontend',
      level: 'Iniciante',
      courses: [
        { title: 'HTML e CSS: O Início do Web Design', url: 'https://www.youtube.com/watch?v=Ejkb_YpuHWs', platform: 'YouTube', duration: '12h', level: 'Iniciante', category: 'Frontend' },
        { title: 'JavaScript Moderno ES6+', url: 'https://www.youtube.com/watch?v=2nXi6mkhu8E', platform: 'YouTube', duration: '15h', level: 'Iniciante', category: 'Frontend' },
        { title: 'React.js: Construindo SPAs de Alto Nível', url: 'https://www.youtube.com/watch?v=7uV8-O_0X-I', platform: 'YouTube', duration: '20h', level: 'Intermediário', category: 'Frontend' }
      ]
    },
    {
      id: 'fullstack-js',
      title: 'Fullstack JavaScript com Node.js',
      description: 'Aprenda a conectar o frontend ao backend utilizando a stack mais popular do mundo.',
      category: 'Fullstack',
      level: 'Intermediário',
      courses: [
        { title: 'Node.js Fundamental: APIs com Express', url: 'https://www.youtube.com/watch?v=f-7mD_L70-8', platform: 'YouTube', duration: '10h', level: 'Intermediário', category: 'Backend' },
        { title: 'Banco de Dados NoSQL com MongoDB', url: 'https://www.youtube.com/watch?v=mY9vAn-piz4', platform: 'YouTube', duration: '8h', level: 'Intermediário', category: 'Banco de Dados' },
        { title: 'Deploy e Nuvem: AWS e Google Cloud', url: 'https://www.youtube.com/watch?v=Zf09Vp2v65k', platform: 'YouTube', duration: '12h', level: 'Avançado', category: 'Infra & Cloud' }
      ]
    }
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen">
        {/* Header */}
      <header className="glass-card sticky top-0 z-50 rounded-none border-t-0 border-x-0">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.location.reload()}>
            <div className="bg-brand-primary p-2 rounded-lg">
              <Terminal className="text-white" size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">DevRoute <span className="text-brand-primary">AI</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6 mr-6">
              <button 
                onClick={() => { setView('home'); setShowAdminPanel(false); }} 
                className={`text-sm font-bold uppercase tracking-widest transition-colors ${view === 'home' && !showAdminPanel ? 'text-brand-primary' : 'text-text-muted hover:text-brand-primary'}`}
              >
                Início
              </button>
              <button 
                onClick={() => { setView('paths'); setShowAdminPanel(false); }} 
                className={`text-sm font-bold uppercase tracking-widest transition-colors ${view === 'paths' ? 'text-brand-primary' : 'text-text-muted hover:text-brand-primary'}`}
              >
                Trilhas
              </button>
            </nav>
            {isAuthReady && user && userData?.role === 'admin' && (
              <button 
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className={`p-2 transition-all rounded-lg ${showAdminPanel ? 'bg-brand-primary text-white' : 'text-text-secondary hover:text-brand-primary hover:bg-white/5'}`}
                title="Painel Admin"
              >
                <Shield size={22} />
              </button>
            )}
            {isAuthReady && user && (
              <>
                <a 
                  href="https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=Matelsohf@gmail.com&item_name=Apoio%20ao%20DevRoute%20AI&currency_code=BRL" 
                  target="_blank" 
                  rel="noopener" 
                  className="p-2 text-text-secondary hover:text-brand-primary transition-all rounded-lg"
                  title="Apoie o DevRoute AI"
                >
                  <Coffee size={22} />
                </a>
                <div className="relative">
                  <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 text-text-secondary hover:text-text-primary transition-all relative"
                >
                  <Bell size={22} />
                  {notifications.some(n => !n.isRead) && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-brand-primary rounded-full border-2 border-bg-main shadow-lg"></span>
                  )}
                </button>
                <NotificationDropdown 
                  show={showNotifications} 
                  notifications={notifications} 
                  onClose={() => setShowNotifications(false)} 
                />
              </div>
            </>
          )}

            {isAuthReady && (
              user ? (
                <div className="flex items-center gap-6 pl-4 border-l border-border-subtle">
                  <div className="hidden md:block">
                    <UserLevelBadge level={userData?.level} xp={userData?.xp} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-bold">{user.displayName}</p>
                      <button onClick={logout} className="text-[10px] uppercase font-bold text-brand-primary">Sair</button>
                    </div>
                    <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt="User" className="w-10 h-10 rounded-full ring-2 ring-brand-primary/20" referrerPolicy="no-referrer" />
                  </div>
                </div>
              ) : (
                <button onClick={login} className="btn-primary flex items-center gap-2">
                  <LogIn size={18} /> Entrar
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        <AnimatePresence>
          {globalError && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex items-center justify-between text-red-500">
                <div className="flex items-center gap-3 text-sm font-medium">
                  <AlertCircle size={18} />
                  {globalError}
                </div>
                <button onClick={() => setGlobalError(null)} className="p-1 hover:bg-white/5 rounded-full">
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showAdminPanel ? (
          <AdminPanel onClose={() => setShowAdminPanel(false)} />
        ) : view === 'paths' ? (
          <LearningPathsGrid 
            paths={featuredPaths} 
            onSelect={(p) => setSelectedPath(p)} 
          />
        ) : (
          <>
            {/* Search Hero */}
            <section className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold uppercase tracking-wider mb-6"
          >
            <Sparkles size={14} /> Powered by Gemini AI
          </motion.div>
          <h2 className="text-5xl sm:text-7xl font-bold mb-8 tracking-tighter">
            Direcione sua carreira <br />
            <span className="text-brand-primary">com inteligência.</span>
          </h2>
          
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSearch} className="relative group mb-8">
              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Qual tecnologia você quer dominar hoje?"
                className="w-full bg-bg-card border border-border-subtle rounded-2xl py-5 px-14 text-lg outline-none focus:ring-4 focus:ring-brand-primary/10 focus:border-brand-primary transition-all shadow-2xl"
              />
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-brand-primary transition-colors" size={24} />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
                <button type="submit" disabled={loading} className="btn-primary h-12 flex items-center gap-2">
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <><Globe size={18} /> Buscar</>}
                </button>
              </div>
            </form>

            <div className="flex flex-wrap justify-center gap-3">
              {categories.map(cat => (
                <button 
                  key={cat.name}
                  onClick={() => { setQueryText(cat.name); handleSearch(); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card hover:bg-white/5 transition-all text-sm font-medium border-none"
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* AI Roadmap CTA */}
        {queryText && !loading && (
          <section className="mb-12">
            <div className="glass-card p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
              <div className="absolute -right-20 -top-20 w-64 h-64 bg-brand-primary/20 blur-[100px]"></div>
              <div>
                <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                  <Map className="text-brand-primary" /> Gerar Trilha de Estudos
                </h3>
                <p className="text-text-secondary">Criar um roadmap personalizado com IA para se tornar "{queryText}"</p>
              </div>
              <button 
                onClick={handleRoadmap}
                disabled={loadingRoadmap}
                className="btn-primary bg-brand-accent hover:bg-brand-accent/90 flex items-center gap-2 whitespace-nowrap"
              >
                {loadingRoadmap ? <Loader2 className="animate-spin" /> : <><Sparkles size={18} /> Ver Roadmap IA</>}
              </button>
            </div>
          </section>
        )}

        {/* Roadmap Display */}
        {roadmap && (
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-16"
          >
            <div className="flex items-center gap-3 mb-8">
              <h3 className="text-xl font-bold">Trilha Personalizada</h3>
              <div className="h-[1px] flex-grow bg-border-subtle"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {roadmap.map((step, i) => (
                <div key={i} className="relative">
                  <div className="glass-card p-6 h-full border-t-4 border-t-brand-accent transition-transform hover:-translate-y-1">
                    <span className="text-3xl font-bold text-brand-accent/20 absolute bottom-4 right-4">{i+1}</span>
                    <h4 className="font-bold mb-3">{step.title}</h4>
                    <div className="flex items-center gap-1.5 text-[10px] text-brand-accent font-bold uppercase mb-2">
                      <Clock size={12} /> {step.estimatedTime}
                    </div>
                    <p className="text-[11px] text-text-secondary mb-4 leading-relaxed">{step.description}</p>
                    
                    {step.prerequisites && step.prerequisites.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[9px] uppercase font-bold text-text-muted mb-2 flex items-center gap-1">
                          <Brain size={10} /> Pré-requisitos:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {step.prerequisites.map(p => (
                            <span key={p} className="text-[8px] bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded italic whitespace-nowrap">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {step.recommendedTopics.slice(0, 3).map(t => (
                        <span key={t} className="text-[9px] bg-white/5 px-2 py-0.5 rounded uppercase tracking-wider">{t}</span>
                      ))}
                    </div>
                  </div>
                  {i < roadmap.length - 1 && (
                    <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-brand-accent">
                      <ChevronRight />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Courses Grid */}
        <section>
          {courses.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
              <h3 className="text-2xl font-bold">Cursos Recomendados</h3>
              <div className="flex gap-2">
                {["Iniciante", "Intermediário", "Avançado"].map(lvl => (
                  <button 
                    key={lvl}
                    onClick={() => setLevelFilter(levelFilter === lvl ? null : lvl)}
                    className={`px-4 py-1.5 rounded-full border text-xs font-bold transition-all ${
                      levelFilter === lvl ? "bg-brand-primary/20 border-brand-primary text-brand-primary" : "border-border-subtle text-text-muted"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence>
              {filteredCourses.map((course, idx) => (
                <CourseCard 
                  key={course.url || idx} 
                  course={course} 
                  idx={idx}
                  isFav={userData?.favorites?.includes(course.url)}
                  progress={userProgress[course.url]}
                  cover={courseCovers[course.url]}
                  onFavorite={() => { toggleFavorite(course.url); }}
                  onClick={() => setSelectedCourse(course)}
                />
              ))}
            </AnimatePresence>
          </div>
          
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-64 bg-bg-card rounded-2xl animate-pulse"></div>
              ))}
            </div>
          )}
        </section>
          </>
        )}
      </main>

      <AnimatePresence>
        {selectedPath && (
          <LearningPathDetailModal 
            path={selectedPath} 
            onClose={() => setSelectedPath(null)}
            onSelectCourse={(c) => {
              setSelectedPath(null);
              setSelectedCourse(c);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCourse && (
          <CourseDetailModal 
            course={selectedCourse} 
            user={user} 
            progress={userProgress[selectedCourse.url]}
            cover={courseCovers[selectedCourse.url]}
            onGenerateCover={(img) => setCourseCovers(prev => ({ ...prev, [selectedCourse.url]: img }))}
            onUpdateProgress={(status) => updateProgress(selectedCourse.url, status)}
            onClose={() => setSelectedCourse(null)} 
          />
        )}
      </AnimatePresence>

      <footer className="border-t border-border-subtle py-20 bg-bg-main">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-12 text-sm">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <Terminal className="text-brand-primary" />
              <span className="text-xl font-bold">DevRoute AI</span>
            </div>
            <p className="max-w-sm text-text-secondary leading-relaxed">
              O futuro do aprendizado em tech é personalizado. Usamos IA para filtrar o ruído e entregar apenas os melhores cursos gratuitos da web.
            </p>
          </div>
          <div>
            <h5 className="font-bold mb-6 uppercase tracking-widest text-[11px] text-text-muted">Plataforma</h5>
            <ul className="space-y-4 text-text-secondary">
              <li><a href="#" className="hover:text-brand-primary">Diretório</a></li>
              <li><a href="#" className="hover:text-brand-primary">Comunidade</a></li>
              <li><a href="#" className="hover:text-brand-primary">Premium</a></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold mb-6 uppercase tracking-widest text-[11px] text-text-muted">Legal</h5>
            <ul className="space-y-4 text-text-secondary">
              <li><a href="#" className="hover:text-brand-primary">Direitos Autorais</a></li>
              <li><a href="#" className="hover:text-brand-primary">Privacidade</a></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold mb-6 uppercase tracking-widest text-[11px] text-text-muted">Apoio</h5>
            <a 
              href="https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=Matelsohf@gmail.com&item_name=Apoio%20ao%20DevRoute%20AI&currency_code=BRL" 
              target="_blank" 
              rel="noopener" 
              className="flex items-center gap-2 group text-text-secondary hover:text-brand-primary transition-colors"
            >
              <div className="bg-white/5 p-2 rounded-lg group-hover:bg-brand-primary/10 transition-colors">
                <Coffee size={18} className="text-brand-primary" />
              </div>
              <div>
                <p className="font-bold leading-none">Apoie o Projeto</p>
                <p className="text-[10px] text-text-muted mt-1">Contribua com a expansão</p>
              </div>
            </a>
          </div>
        </div>
      </footer>
    </div>
    </ErrorBoundary>
  );
}

function TableRowSkeleton() {
  return (
    <tr>
      <td className="py-4 px-4"><div className="w-10 h-10 bg-white/5 rounded-lg animate-pulse" /></td>
      <td className="py-4 px-4"><div className="w-32 h-4 bg-white/5 rounded animate-pulse" /></td>
      <td className="py-4 px-4"><div className="w-24 h-4 bg-white/5 rounded animate-pulse" /></td>
      <td className="py-4 px-4 text-right"><div className="w-8 h-8 bg-white/5 rounded animate-pulse ml-auto" /></td>
    </tr>
  );
}

function LearningPathsGrid({ paths, onSelect }: { paths: LearningPath[], onSelect: (p: LearningPath) => void }) {
  return (
    <div className="space-y-12">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-4xl font-bold mb-4 tracking-tight">Trilhas de Aprendizado</h2>
        <p className="text-text-secondary">Curadoria feita por especialistas para guiar você do absoluto zero até o primeiro emprego em tech.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {paths.map((path, idx) => (
          <motion.div
            key={path.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            onClick={() => onSelect(path)}
            className="group glass-card overflow-hidden hover:border-brand-primary transition-all cursor-pointer flex flex-col p-6"
          >
            <div className="w-12 h-12 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary mb-6 group-hover:bg-brand-primary group-hover:text-white transition-all">
              <Map size={24} />
            </div>
            <div className="text-[10px] text-brand-primary font-bold uppercase tracking-widest mb-2">{path.category}</div>
            <h3 className="text-xl font-bold mb-3 group-hover:text-brand-primary transition-colors">{path.title}</h3>
            <p className="text-sm text-text-secondary line-clamp-2 mb-6 flex-grow">{path.description}</p>
            
            <div className="flex items-center justify-between border-t border-border-subtle pt-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-text-muted">
                <BookOpen size={14} /> {path.courses.length} Cursos
              </div>
              <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                path.level === 'Iniciante' ? 'bg-green-500/10 text-green-500' :
                path.level === 'Intermediário' ? 'bg-yellow-500/10 text-yellow-500' :
                'bg-red-500/10 text-red-500'
              }`}>
                {path.level}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function LearningPathDetailModal({ path, onClose, onSelectCourse }: { 
  path: LearningPath, 
  onClose: () => void,
  onSelectCourse: (c: CourseResult) => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-bg-main/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="glass-card bg-bg-card max-w-4xl w-full p-8 relative overflow-hidden flex flex-col max-h-[90vh]"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-colors z-10"
        >
          <X size={24} />
        </button>

        <div className="absolute -right-20 -top-20 w-80 h-80 bg-brand-primary/10 blur-[100px] pointer-events-none"></div>

        <div className="mb-8 relative z-10">
          <div className="text-[10px] text-brand-primary font-bold uppercase tracking-widest mb-2">{path.category}</div>
          <h2 className="text-3xl font-bold mb-4">{path.title}</h2>
          <p className="text-text-secondary max-w-2xl">{path.description}</p>
        </div>

        <div className="overflow-y-auto flex-grow pr-4 custom-scrollbar relative z-10">
          <div className="space-y-8 pb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-brand-primary text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                Sequência do Roadmap
              </div>
            </div>
            
            {path.courses.map((course, idx) => (
              <div key={idx} className="relative pl-12">
                {/* Timeline Line */}
                {idx < path.courses.length - 1 && (
                  <div className="absolute left-6 top-8 bottom-0 w-0.5 bg-gradient-to-b from-brand-primary/50 to-transparent"></div>
                )}
                
                {/* Step Circle */}
                <div className="absolute left-0 top-0 w-12 h-12 rounded-2xl bg-white/5 border border-border-subtle flex items-center justify-center font-bold text-brand-primary">
                  {idx + 1}
                </div>

                <div 
                  onClick={() => onSelectCourse(course)}
                  className="glass-card p-6 border-none bg-white/[0.03] hover:bg-white/[0.06] transition-all cursor-pointer group"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-lg group-hover:text-brand-primary transition-colors mb-1">{course.title}</h4>
                      <div className="flex items-center gap-4 text-xs text-text-muted">
                        <span className="flex items-center gap-1"><Terminal size={12} /> {course.platform}</span>
                        <span className="flex items-center gap-1"><Clock size={12} /> {course.duration}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                          course.level === 'Iniciante' ? 'bg-green-500/10 text-green-500' :
                          course.level === 'Intermediário' ? 'bg-yellow-500/10 text-yellow-500' :
                          'bg-red-500/10 text-red-500'
                        }`}>
                          {course.level}
                        </span>
                      </div>
                    </div>
                    <button className="self-start md:self-center p-3 rounded-xl bg-brand-primary text-white shadow-lg shadow-brand-primary/20 opacity-0 group-hover:opacity-100 transition-all">
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border-subtle flex justify-between items-center relative z-10">
          <p className="text-xs text-text-muted flex items-center gap-2">
            <Info size={14} /> Clique em um curso para ver detalhes e avaliações.
          </p>
          <button onClick={onClose} className="btn-primary py-2 px-6">Fechar Trilha</button>
        </div>
      </motion.div>
    </div>
  );
}

function UserLevelBadge({ level, xp }: { level?: number, xp?: number }) {
  const currentLevel = level || 1;
  const currentXP = xp || 0;
  // XP formula reversed for progress bar: minXP for next level = nível^2 * 100
  const nextLevelXP = Math.pow(currentLevel, 2) * 100;
  const prevLevelXP = Math.pow(currentLevel - 1, 2) * 100;
  const progress = ((currentXP - prevLevelXP) / (nextLevelXP - prevLevelXP)) * 100;

  return (
    <div className="flex flex-col gap-1.5 min-w-[140px]">
      <div className="flex justify-between items-end">
        <span className="text-[9px] uppercase font-bold text-text-muted tracking-tighter flex items-center gap-1">
          <Sparkles size={10} className="text-brand-primary" /> Nível {currentLevel}
        </span>
        <span className="text-[9px] font-mono text-text-secondary">{currentXP} XP</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-[1px]">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
          className="h-full bg-gradient-to-r from-brand-primary to-brand-primary/60 rounded-full shadow-[0_0_8px_rgba(var(--brand-primary-rgb),0.4)]"
        />
      </div>
    </div>
  );
}

function AnalyticsDashboard() {
  const [searchLogs, setSearchLogs] = useState<SearchLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'searches'), orderBy('timestamp', 'desc'), limit(200));
    return onSnapshot(q, (snap) => {
      setSearchLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as SearchLog)));
      setLoading(false);
    });
  }, []);

  // Process data for charts
  const topSearches = (() => {
    const counts: Record<string, number> = {};
    searchLogs.forEach(log => {
      const q = log.query.toLowerCase().trim();
      counts[q] = (counts[q] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  })();

  const searchVolume = (() => {
    const daily: Record<string, number> = {};
    searchLogs.forEach(log => {
      if (!log.timestamp) return;
      const date = log.timestamp.toDate ? log.timestamp.toDate().toLocaleDateString() : new Date(log.timestamp).toLocaleDateString();
      daily[date] = (daily[date] || 0) + 1;
    });
    return Object.entries(daily)
      .map(([name, value]) => ({ name, value }))
      .reverse(); // Simplified time series
  })();

  if (loading) return (
    <div className="flex-grow flex items-center justify-center">
      <Loader2 className="animate-spin text-brand-primary" size={40} />
    </div>
  );

  return (
    <div className="flex-grow space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[400px]">
        <div className="glass-card bg-black/20 p-6 flex flex-col">
          <h3 className="font-bold text-sm uppercase text-text-muted mb-6 flex items-center gap-2">
            <Search size={14} className="text-brand-primary" /> Top 10 Buscas
          </h3>
          <div className="flex-grow min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSearches} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.4)" fontSize={10} width={100} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                  itemStyle={{ color: '#00F0FF' }}
                />
                <Bar dataKey="value" fill="#00F0FF" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card bg-black/20 p-6 flex flex-col">
          <h3 className="font-bold text-sm uppercase text-text-muted mb-6 flex items-center gap-2">
            <Clock size={14} className="text-brand-primary" /> Volume de Buscas (Últimos Dias)
          </h3>
          <div className="flex-grow min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={searchVolume}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00F0FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={10} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
                <RechartsTooltip 
                   contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                />
                <Area type="monotone" dataKey="value" stroke="#00F0FF" fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="glass-card bg-black/20 p-6">
        <h3 className="font-bold text-sm uppercase text-text-muted mb-6">Últimas 10 Buscas em Tempo Real</h3>
        <div className="space-y-3">
          {searchLogs.slice(0, 10).map(log => (
            <div key={log.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-brand-primary/20 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                  <Search size={14} />
                </div>
                <div>
                  <p className="font-bold text-sm">"{log.query}"</p>
                  <p className="text-[10px] text-text-muted">{log.userId ? `Usuário: ${log.userId.slice(0, 8)}...` : 'Anônimo'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-text-muted uppercase font-bold">{log.resultsCount} Resultados</p>
                <p className="text-[9px] font-mono opacity-40">{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString() : 'N/A'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminPanel({ onClose }: { onClose: () => void }) {
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailedUser, setDetailedUser] = useState<UserData | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'analytics'>('users');

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('lastLogin', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      setAllUsers(snap.docs.map(d => ({ ...d.data(), uid: d.id } as UserData)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
  }, []);

  const filtered = allUsers.filter(u => 
    u.displayName.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card bg-bg-card p-8 min-h-[700px] flex flex-col relative overflow-hidden"
    >
      <div className="absolute -right-20 -top-20 w-80 h-80 bg-brand-primary/5 blur-[100px] pointer-events-none"></div>

      <div className="flex justify-between items-center mb-8 pb-6 border-b border-border-subtle relative z-10">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <Shield className="text-brand-primary" /> Painel Administrativo
          </h2>
          <div className="flex gap-4 mt-2">
            <button 
              onClick={() => setActiveTab('users')}
              className={`text-[10px] uppercase font-bold tracking-widest pb-1 transition-all ${activeTab === 'users' ? 'text-brand-primary border-b-2 border-brand-primary' : 'text-text-muted hover:text-text-primary'}`}
            >
              Gestão de Usuários
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`text-[10px] uppercase font-bold tracking-widest pb-1 transition-all ${activeTab === 'analytics' ? 'text-brand-primary border-b-2 border-brand-primary' : 'text-text-muted hover:text-text-primary'}`}
            >
              Analytics de Busca
            </button>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="hidden sm:flex gap-8 mr-8 border-r border-border-subtle pr-8">
            <div className="text-center">
              <p className="text-[10px] text-text-muted uppercase font-bold mb-1">Total Usuários</p>
              <p className="text-xl font-bold">{allUsers.length}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><X size={24} /></button>
        </div>
      </div>

      {activeTab === 'users' ? (
        <>
          <div className="mb-6 relative z-10">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar usuários por nome ou email..."
              className="w-full bg-white/5 border border-border-subtle rounded-xl py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all cursor-text"
            />
          </div>

          <div className="overflow-x-auto relative z-10">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted text-[10px] uppercase font-bold tracking-widest">
                  <th className="py-4 px-4">Usuário</th>
                  <th className="py-4 px-4">Papel</th>
                  <th className="py-4 px-4">Nível / XP</th>
                  <th className="py-4 px-4 text-center">Último Acesso</th>
                  <th className="py-4 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map(u => (
                  <tr key={u.uid} className="hover:bg-brand-primary/[0.02] transition-colors group">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <img src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} className="w-10 h-10 rounded-lg shadow-lg" />
                        <div>
                          <p className="font-bold text-sm group-hover:text-brand-primary transition-colors">{u.displayName}</p>
                          <p className="text-[10px] text-text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'bg-white/5 text-text-muted'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <UserLevelBadge level={u.level} xp={u.xp} />
                    </td>
                    <td className="py-4 px-4 text-xs text-text-muted italic text-center tabular-nums">{formatDate(u.lastLogin)}</td>
                    <td className="py-4 px-4 text-right">
                      <button 
                        onClick={() => setDetailedUser(u)}
                        className="p-2 text-text-muted hover:text-brand-primary hover:bg-white/5 rounded-lg transition-all"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {loading && (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-text-muted animate-pulse">
                      <Loader2 className="animate-spin mx-auto mb-2" />
                      Carregando diretório...
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-20 text-center opacity-20">
                      <Users size={48} className="mx-auto mb-4" />
                      <p className="text-xs uppercase font-bold">Nenhum usuário encontrado</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <AnalyticsDashboard />
      )}

      <AnimatePresence>
        {detailedUser && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-bg-main/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card bg-bg-card max-w-lg w-full p-8 relative overflow-hidden"
            >
              <button 
                onClick={() => setDetailedUser(null)}
                className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col items-center text-center mb-8">
                <img src={detailedUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${detailedUser.uid}`} className="w-24 h-24 rounded-2xl shadow-2xl mb-4 p-1 bg-brand-primary/20" />
                <h3 className="text-2xl font-bold">{detailedUser.displayName}</h3>
                <p className="text-text-secondary flex items-center gap-2 mt-1">
                  {detailedUser.email}
                  <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${detailedUser.role === 'admin' ? 'bg-brand-primary/20 text-brand-primary' : 'bg-white/5 text-text-muted'}`}>
                    {detailedUser.role}
                  </span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-4 rounded-xl bg-white/5 border border-border-subtle">
                  <p className="text-[10px] text-text-muted uppercase font-bold mb-1">ID Único</p>
                  <p className="text-xs font-mono break-all">{detailedUser.uid}</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-border-subtle">
                  <p className="text-[10px] text-text-muted uppercase font-bold mb-1">Último Login</p>
                  <p className="text-xs">{formatDate(detailedUser.lastLogin)}</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-border-subtle">
                  <p className="text-[10px] text-text-muted uppercase font-bold mb-1">Tópicos Favoritos</p>
                  <p className="text-xs">{detailedUser.followedTopics?.length || 0}</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-border-subtle">
                  <p className="text-[10px] text-text-muted uppercase font-bold mb-1">Cursos Salvos</p>
                  <p className="text-xs">{detailedUser.favorites?.length || 0}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setDetailedUser(null)}
                  className="flex-grow btn-primary bg-white/5 border border-border-subtle hover:bg-white/10"
                >
                  Fechar
                </button>
                {/* Futuras ações administrativas podem ir aqui */}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CourseCard({ course, idx, isFav, onFavorite, onClick, progress, cover }: { 
  course: CourseResult, 
  idx: number, 
  isFav?: boolean, 
  onFavorite: () => void | Promise<void>,
  onClick: () => void,
  progress?: 'started' | 'completed',
  cover?: string,
  key?: any
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({
          title: course.title,
          text: `Confira este curso gratuito no DevRoute AI: ${course.title}`,
          url: course.url,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(course.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      onClick={onClick}
      className="group glass-card overflow-hidden hover:border-brand-primary transition-all cursor-pointer flex flex-col"
    >
      <div className="relative h-40 bg-white/5 border-b border-white/10 overflow-hidden text-white">
        {cover ? (
          <img src={cover} alt={course.title} className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-10 bg-gradient-to-br from-brand-primary to-brand-secondary">
            <Sparkles size={40} />
          </div>
        )}
        <div className="absolute top-4 left-4">
          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
            course.level === 'Iniciante' ? 'bg-green-500/80' :
            course.level === 'Intermediário' ? 'bg-yellow-500/80' :
            'bg-red-500/80'
          } backdrop-blur-md`}>
            {course.level}
          </span>
        </div>
      </div>
      
      <div className="p-6">
        <div className="flex justify-between items-start mb-2">
          <div className="text-[10px] text-brand-primary font-bold uppercase tracking-widest">{course.category}</div>
          <div className="flex gap-2">
            <button 
              onClick={handleShare}
              className="p-1.5 rounded-lg transition-all text-text-muted hover:text-brand-primary relative"
              title="Compartilhar curso"
            >
              {copied ? <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-brand-primary text-white text-[8px] px-2 py-1 rounded font-bold animate-bounce">Copiado!</span> : null}
              <Share2 size={18} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onFavorite(); }}
              className={`p-1.5 rounded-lg transition-all ${isFav ? 'bg-red-500/10 text-red-500' : 'text-text-muted hover:text-red-500'}`}
            >
              <Heart size={18} fill={isFav ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        
        <h4 className="text-lg font-bold mb-2 group-hover:text-brand-primary transition-colors line-clamp-2 leading-tight">
          {course.title}
        </h4>
        <p className="text-xs text-text-secondary line-clamp-3 mb-6 leading-relaxed">
          {course.description}
        </p>
      </div>

      <div className="mt-auto p-6 bg-white/5 border-t border-border-subtle flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-text-muted">Plataforma</span>
          <span className="text-xs font-bold">{course.platform}</span>
        </div>
        {progress && (
          <div className={`px-2 py-1 rounded-md flex items-center gap-1 text-[10px] font-bold uppercase ${
            progress === 'completed' ? 'bg-brand-secondary/20 text-brand-secondary' : 'bg-brand-primary/20 text-brand-primary'
          }`}>
            {progress === 'completed' ? <Award size={12} /> : <Loader2 className="animate-spin" size={12} />}
            {progress === 'completed' ? 'Concluído' : 'Em curso'}
          </div>
        )}
      </div>
    </motion.div>
  );
}


function CourseDetailModal({ course, user, progress, cover, onGenerateCover, onUpdateProgress, onClose }: { 
  course: CourseResult, 
  user: User | null, 
  progress?: 'started' | 'completed', 
  cover?: string,
  onGenerateCover: (img: string) => void,
  onUpdateProgress: (status: 'started' | 'completed') => void,
  onClose: () => void 
}) {
  const [reviews, setReviews] = useState<CommentData[]>([]);
  const [ratings, setRatings] = useState<RatingData[]>([]);
  const [userRating, setUserRating] = useState<number>(0);
  const [newReview, setNewReview] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      try {
        await navigator.share({
          title: course.title,
          text: `Confira este curso gratuito no DevRoute AI: ${course.title}`,
          url: course.url,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(course.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  useEffect(() => {
    const qReviews = query(
      collection(db, 'comments'), 
      where('courseUrl', '==', course.url),
      orderBy('timestamp', 'desc')
    );
    const qRatings = query(
      collection(db, 'ratings'),
      where('courseUrl', '==', course.url)
    );

    const unsubReviews = onSnapshot(qReviews, (snap) => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommentData)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'comments'));

    const unsubRatings = onSnapshot(qRatings, (snap) => {
      const r = snap.docs.map(d => ({ id: d.id, ...d.data() } as RatingData));
      setRatings(r);
      if (user) {
        const myR = r.find(x => x.userId === user.uid);
        if (myR) setUserRating(myR.rating);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'ratings'));

    return () => {
      unsubReviews();
      unsubRatings();
    };
  }, [course, user]);

  const avgRating = ratings.length > 0 
    ? (ratings.reduce((acc, curr) => acc + curr.rating, 0) / ratings.length).toFixed(1)
    : '0.0';

  const handleRating = async (val: number) => {
    if (!user) return;
    setUserRating(val);
    const rId = `${user.uid}_${btoa(course.url).slice(0, 50)}`;
    try {
      await setDoc(doc(db, 'ratings', rId), {
        courseUrl: course.url,
        userId: user.uid,
        rating: val,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `ratings/${rId}`);
    }
  };

  const handleGenerateCover = async () => {
    setIsGeneratingCover(true);
    try {
      const img = await generateCourseImage(course.title);
      onGenerateCover(img);
    } catch (e) {
      console.error(e);
      // If error might be due to missing paid key
      if (e instanceof Error && (e.message.includes('not found') || e.message.includes('403'))) {
        if (window.aistudio?.openSelectKey) {
            await window.aistudio.openSelectKey();
        } else {
            alert('Erro ao gerar imagem. Verifique suas permissões da API Gemini.');
        }
      }
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const updateProgress = async (status: 'started' | 'completed') => {
    if (!user) return;
    const pId = `${user.uid}_${btoa(course.url).slice(0, 50)}`;
    try {
      await setDoc(doc(db, 'progress', pId), {
        userId: user.uid,
        courseUrl: course.url,
        status,
        lastUpdated: serverTimestamp()
      });
      
      // Notify user
      if (status === 'completed') {
        await addDoc(collection(db, 'notifications'), {
          userId: user.uid,
          title: "Parabéns, Explorer!",
          message: `Você concluiu o curso: ${course.title}. Continue assim!`,
          topic: course.category,
          isRead: false,
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (!newReview.trim()) {
      setReviewError("O comentário não pode estar vazio.");
      return;
    }
    
    if (newReview.length < 5) {
      setReviewError("Seu comentário é muito curto.");
      return;
    }

    setReviewError(null);
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'comments'), {
        courseUrl: course.url,
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoURL,
        text: newReview,
        timestamp: serverTimestamp()
      });
      setNewReview('');
    } catch (err) {
      console.error(err);
      setReviewError("Não foi possível enviar seu comentário.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const youtubeId = getYoutubeId(course.url);

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bg-main/80 backdrop-blur-md"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="glass-card bg-bg-card w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="p-8 border-b border-border-subtle flex justify-between items-start">
          <div className="flex-grow">
            <div className="flex gap-2 items-center mb-4">
              <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary text-[10px] font-bold rounded uppercase tracking-widest">{course.category}</span>
              <span className="text-text-muted text-[10px]">•</span>
              <span className="text-text-muted text-[10px] uppercase font-bold">{course.platform}</span>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-3xl font-bold leading-tight">{course.title}</h2>
              <div className="flex items-center gap-1.5 bg-brand-primary/10 px-3 py-1.5 rounded-full border border-brand-primary/20">
                <Star size={16} className="text-brand-primary fill-brand-primary" />
                <span className="text-sm font-bold text-brand-primary">{avgRating}</span>
                <span className="text-xs text-text-muted">({ratings.length})</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full"><X size={24} /></button>
        </div>

        <div className="flex-grow overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
          {/* Main Info */}
          <div className="lg:col-span-8 p-8 border-r border-border-subtle">
            {youtubeId ? (
              <div className="relative rounded-2xl overflow-hidden mb-8 aspect-video bg-black shadow-2xl border border-border-subtle">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=0&rel=0`}
                  title={course.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                ></iframe>
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden mb-8 h-64 bg-white/5 border border-border-subtle group/cover">
                {cover ? (
                  <img src={cover} alt={course.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center opacity-20">
                    <Sparkles size={64} className="mb-4 text-brand-primary" />
                    <p className="text-xs uppercase font-bold tracking-widest text-text-muted">Sem Capa Gerada</p>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/cover:opacity-100 transition-all duration-300 flex items-center justify-center pointer-events-none group-hover/cover:pointer-events-auto">
                  <button 
                    onClick={handleGenerateCover}
                    disabled={isGeneratingCover}
                    className="bg-brand-primary hover:bg-brand-primary/80 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-2xl transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isGeneratingCover ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                    {isGeneratingCover ? 'Gerando sua Capa...' : 'Gerar Capa com IA (Imagen)'}
                  </button>
                </div>
              </div>
            )}

            <h4 className="text-[11px] font-bold uppercase text-text-muted tracking-widest mb-4">Visão Geral</h4>
            <p className="text-text-secondary leading-relaxed mb-10">{course.description}</p>
            
            <div className="grid grid-cols-2 gap-4 mb-10">
              <div className="p-4 bg-white/5 rounded-xl">
                <span className="text-[10px] text-text-muted uppercase font-bold block mb-1">Duração / Nível</span>
                <p className="font-bold flex items-center gap-2"><Award size={16} className="text-brand-primary" /> {course.level}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-xl">
                <span className="text-[10px] text-text-muted uppercase font-bold block mb-1">Status Legal</span>
                <p className="font-bold flex items-center gap-2"><CheckCircle2 size={16} className="text-brand-secondary" /> Gratuito & Oficial</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <a href={course.url} target="_blank" rel="noopener" className="btn-primary flex-grow text-center flex items-center justify-center gap-2 py-4">
                Ir para Plataforma <ExternalLink size={18} />
              </a>
              <button 
                onClick={handleShare}
                className="btn-outline py-4 px-6 flex items-center gap-2 relative transition-all"
                title="Compartilhar curso"
              >
                {copied && <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-brand-primary text-white text-[10px] px-3 py-1.5 rounded-lg font-bold animate-bounce whitespace-nowrap shadow-xl">Link Copiado!</span>}
                <Share2 size={18} />
                <span className="hidden sm:inline">Compartilhar</span>
              </button>
              {user && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => onUpdateProgress('started')}
                    className={`btn-outline whitespace-nowrap transition-all ${progress === 'started' ? 'bg-brand-primary text-white border-brand-primary shadow-lg shadow-brand-primary/20' : 'hover:border-brand-primary hover:text-brand-primary'}`}
                  >
                    {progress === 'started' ? 'Em curso' : 'Iniciar Estudo'}
                  </button>
                  <button 
                    onClick={() => onUpdateProgress('completed')}
                    className={`btn-outline whitespace-nowrap transition-all ${progress === 'completed' ? 'bg-brand-secondary text-white border-brand-secondary shadow-lg shadow-brand-secondary/20' : 'hover:border-brand-secondary hover:text-brand-secondary'}`}
                  >
                    {progress === 'completed' ? 'Concluído' : 'Marcar como Feito'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Social / reviews */}
          <div className="lg:col-span-4 flex flex-col h-full bg-black/20">
            <div className="p-6 border-b border-border-subtle bg-white/5">
              <h4 className="flex items-center gap-2 font-bold text-sm">
                <MessageSquare size={16} className="text-brand-primary" /> Avaliações ({reviews.length})
              </h4>
            </div>
            
            <div className="flex-grow p-6 overflow-y-auto space-y-6">
              {reviews.map(r => (
                <div key={r.id} className="flex gap-3">
                  <img src={r.userPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.userId}`} className="w-8 h-8 rounded-lg flex-shrink-0" />
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] font-bold">{r.userName}</span>
                      <span className="text-[8px] text-text-muted">{r.timestamp?.toDate().toLocaleDateString()}</span>
                    </div>
                    <p className="text-[11px] text-text-secondary leading-relaxed bg-white/5 p-2 rounded-lg">{r.text}</p>
                  </div>
                </div>
              ))}
              {reviews.length === 0 && (
                <div className="text-center py-10 opacity-20">
                  <Inbox size={40} className="mx-auto mb-2" />
                  <p className="text-[10px] uppercase font-bold">Sem comentários</p>
                </div>
              )}
            </div>

            {user ? (
              <div className="p-6 border-t border-border-subtle bg-white/5 space-y-4">
                <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-black/40 border border-white/5">
                  <p className="text-[10px] uppercase font-bold text-text-muted mb-3 tracking-widest">Sua Avaliação</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button 
                        key={star} 
                        onClick={() => handleRating(star)}
                        className={`transition-all ${star <= userRating ? 'text-brand-primary scale-110' : 'text-white/10 hover:text-white/40'}`}
                      >
                        <Star size={24} fill={star <= userRating ? "currentColor" : "none"} />
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleReview} className="relative bg-bg-card">
                  <input 
                    type="text" 
                    value={newReview}
                    onChange={(e) => {
                      setNewReview(e.target.value);
                      if (reviewError) setReviewError(null);
                    }}
                    placeholder="O que achou deste curso?"
                    className={`w-full bg-white/5 border rounded-xl py-3 pl-4 pr-12 text-xs outline-none transition-all ${
                      reviewError ? 'input-error' : 'border-border-subtle focus:ring-2 focus:ring-brand-primary/20'
                    }`}
                  />
                  <button type="submit" disabled={isSubmitting} className={`absolute right-6 top-1/2 -translate-y-1/2 transition-colors ${reviewError ? 'text-red-500' : 'text-brand-primary'}`}>
                    <Send size={18} />
                  </button>
                  {reviewError && (
                    <p className="text-error">
                      <AlertCircle size={10} /> {reviewError}
                    </p>
                  )}
                </form>
              </div>
            ) : (
              <div className="p-4 text-center bg-white/5">
                <p className="text-[10px] font-bold uppercase text-text-muted mb-2">Faça login para avaliar</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function NotificationDropdown({ show, notifications, onClose }: { show: boolean, notifications: NotificationData[], onClose: () => void }) {
  if (!show) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose}></div>
      <motion.div 
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="absolute right-0 mt-4 w-80 glass-card bg-bg-card shadow-2xl z-50 overflow-hidden"
      >
        <div className="p-4 border-b border-border-subtle bg-white/5 flex justify-between items-center">
          <span className="text-[10px] uppercase font-bold tracking-widest">Inbox</span>
          {notifications.length > 0 && <span className="text-[9px] bg-brand-primary px-2 py-0.5 rounded text-white font-bold">{notifications.filter(n => !n.isRead).length} Novos</span>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.map(n => (
            <div key={n.id} className={`p-4 border-b border-border-subtle hover:bg-white/5 transition-all relative ${!n.isRead ? 'bg-brand-primary/[0.03]' : 'opacity-60'}`}>
              <p className="text-xs font-bold mb-1">{n.title}</p>
              <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-2">{n.message}</p>
            </div>
          ))}
          {notifications.length === 0 && (
            <div className="p-12 text-center opacity-20">
              <Inbox size={32} className="mx-auto mb-3" />
              <p className="text-[10px] font-bold uppercase">Atividades vazias</p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

