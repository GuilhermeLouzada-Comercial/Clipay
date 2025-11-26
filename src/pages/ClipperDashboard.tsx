import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// --- SISTEMA DE GAMIFICAÇÃO ---
const RANKS = [
  { name: 'Bronze', min: 0, max: 1000, color: '#cd7f32' },
  { name: 'Prata', min: 1001, max: 3000, color: '#94a3b8' }, // Slate-400
  { name: 'Ouro', min: 3001, max: 8000, color: '#fbbf24' },  // Amber-400
  { name: 'Diamante', min: 8001, max: 999999, color: '#3b82f6' } // Blue-500
];

const XP_RULES = [
  { action: 'Entrar em Campanha', xp: 50, icon: Icons.Briefcase },
  { action: 'Vídeo Postado', xp: 100, icon: Icons.Play },
  { action: 'Vídeo Aprovado', xp: 300, icon: Icons.CheckCircle },
  { action: 'Bater 10k Views', xp: 1000, icon: Icons.BarChart3 },
];

// --- TIPOS ---
interface UserData {
  name: string;
  pixKey: string;
  email: string;
  xp: number; 
}

interface Campaign {
  id: string;
  title: string;
  creator: string;
  rewardPool: string;
  status: 'active' | 'full';
  tags: string[];
}

// Tipo para o progresso para ajudar o TypeScript
type ProgressType = 100 | { current: number; total: number };

type ViewType = 'overview' | 'campaigns' | 'experience' | 'rankings' | 'settings';

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}

// --- COMPONENTES AUXILIARES ---

const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, color }) => (
  <div style={{ 
    background: 'var(--bg-card)', 
    padding: '20px', 
    borderRadius: '12px', 
    border: '1px solid var(--border)', 
    display: 'flex', 
    alignItems: 'center', 
    gap: '15px',
    boxShadow: 'var(--shadow-card)'
  }}>
    <div style={{ width: '45px', height: '45px', borderRadius: '10px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}>
      <Icon size={24} />
    </div>
    <div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>{value}</div>
    </div>
  </div>
);

// Componente de Gráfico Circular
const CircularProgress = ({ value, max, color, size = 200, strokeWidth = 15 }: { value: number, max: number, color: string, size?: number, strokeWidth?: number }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  // Evita divisão por zero
  const percent = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 1;
  const dashOffset = circumference - percent * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div style={{ 
        position: 'absolute', 
        top: '50%', 
        left: '50%', 
        transform: 'translate(-50%, -50%)', 
        textAlign: 'center' 
      }}>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
          {Math.round(percent * 100)}%
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>para o próximo elo</div>
      </div>
    </div>
  );
};

export default function ClipperDashboard() {
  const navigate = useNavigate();
  
  const [view, setView] = useState<ViewType>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userData, setUserData] = useState<UserData>({ name: '', pixKey: '', email: '', xp: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  const campaigns: Campaign[] = [
    { id: '1', title: 'Copa do Podpah', creator: 'Podpah', rewardPool: 'R$ 5.000', status: 'active', tags: ['Alta Demanda', 'Podcast'] },
    { id: '2', title: 'Lançamento Curso Tech', creator: 'DevMaster', rewardPool: 'R$ 2.000', status: 'active', tags: ['Tecnologia', 'Educação'] },
    { id: '3', title: 'Maratona Fitness', creator: 'IronBerg', rewardPool: 'R$ 10.000', status: 'full', tags: ['Esportes', 'Vagas Cheias'] },
  ];

  const getCurrentRank = () => {
    const xp = userData.xp || 0;
    return RANKS.find(r => xp >= r.min && xp <= r.max) || RANKS[RANKS.length - 1];
  };

  const getNextRank = () => {
    const current = getCurrentRank();
    const index = RANKS.findIndex(r => r.name === current.name);
    return RANKS[index + 1] || null;
  };

  const currentRank = getCurrentRank();
  const nextRank = getNextRank();

  // CORREÇÃO: Definindo explicitamente o retorno como ProgressType
  const getProgressToNextRank = (): ProgressType => {
    if (!nextRank) return 100;
    const totalNeeded = nextRank.min - currentRank.min;
    const currentProgress = (userData.xp || 0) - currentRank.min;
    return { current: currentProgress, total: totalNeeded };
  };

  const progress = getProgressToNextRank();

  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        const docRef = doc(db, "users", auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserData({ ...data, xp: data.xp || 0 } as UserData);
        }
        setLoading(false);
      }
    };
    fetchUserData();

    const savedTheme = localStorage.getItem('clipay-theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('clipay-theme', newTheme);
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (!auth.currentUser) return;

    try {
      const docRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(docRef, {
        name: userData.name,
        pixKey: userData.pixKey
      });
      alert("Dados atualizados com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Erro ao salvar dados.");
    } finally {
      setSaving(false);
    }
  };

  const changeView = (newView: ViewType) => {
    setView(newView);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="dashboard-layout">
      <style>{`
        [data-theme="light"] .sidebar-btn:hover {
          color: var(--primary) !important;
          background: var(--bg-card-hover);
        }
        .dash-input-wrapper {
          display: flex;
          align-items: center;
          background: var(--bg-card-hover);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0 12px;
          transition: var(--transition);
        }
        .dash-input-wrapper:focus-within {
          border-color: var(--primary);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        .dash-input {
          background: transparent;
          border: none;
          color: var(--text-main);
          width: 100%;
          padding: 12px 0;
          outline: none;
        }
        .campaign-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            transition: all 0.3s ease;
        }
        .campaign-card:hover {
            transform: translateY(-5px);
            border-color: var(--primary);
            box-shadow: var(--shadow-card);
        }
        @media (max-width: 768px) {
          .desktop-theme-toggle { display: none !important; }
        }
      `}</style>

      {/* 1. HEADER MOBILE */}
      <div className="mobile-header" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', color: 'var(--primary)' }}>
          <Icons.Play fill="var(--primary)" size={24} />
          Clipay
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div className="theme-toggle" onClick={toggleTheme} style={{ width: '60px', height: '30px', padding: '3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', cursor: 'pointer', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', borderRadius: '30px' }}>
            <div className="theme-toggle-bg" style={{ position: 'absolute', left: '3px', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--primary)', transition: 'transform 0.3s ease', transform: theme === 'dark' ? 'translateX(30px)' : 'translateX(0)' }}></div>
            <div style={{ zIndex: 2, width: '22px', display: 'flex', justifyContent: 'center' }}><Icons.Sun size={14} color={theme === 'light' ? 'white' : 'var(--text-muted)'} /></div>
            <div style={{ zIndex: 2, width: '22px', display: 'flex', justifyContent: 'center' }}><Icons.Moon size={14} color={theme === 'dark' ? 'white' : 'var(--text-muted)'} /></div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}>
            {isMobileMenuOpen ? <Icons.X size={28} /> : <Icons.Menu size={28} />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && <div className="overlay" onClick={() => setIsMobileMenuOpen(false)}></div>}

      {/* 2. SIDEBAR */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`} style={{ background: 'var(--bg-card)', borderRight: '1px solid var(--border)' }}>
        <div style={{ padding: '25px 20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
          <Icons.Play fill="var(--primary)" size={28} />
          Clipay Clipper
        </div>

        <nav className="sidebar-nav">
          <button onClick={() => changeView('overview')} className={`sidebar-btn ${view === 'overview' ? 'active' : ''}`}>
            <Icons.BarChart3 size={20} /> Visão Geral
          </button>
          
          <button onClick={() => changeView('campaigns')} className={`sidebar-btn ${view === 'campaigns' ? 'active' : ''}`}>
            <Icons.Briefcase size={20} /> Campanhas <span style={{ marginLeft: 'auto', fontSize: '0.7rem', background: 'var(--primary)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>Novo</span>
          </button>

          <button onClick={() => changeView('experience')} className={`sidebar-btn ${view === 'experience' ? 'active' : ''}`}>
            <Icons.Target size={20} /> Nível & XP
          </button>

          <button onClick={() => changeView('rankings')} className={`sidebar-btn ${view === 'rankings' ? 'active' : ''}`}>
            <Icons.Trophy size={20} /> Rankings
          </button>
          
          <button onClick={() => changeView('settings')} className={`sidebar-btn ${view === 'settings' ? 'active' : ''}`}>
            <Icons.User size={20} /> Configurações
          </button>
        </nav>

        <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={handleLogout} className="sidebar-btn" style={{ color: 'var(--danger)' }}>
            <Icons.LogOut size={20} /> Sair da Conta
          </button>
        </div>
      </aside>

      {/* 3. CONTEÚDO PRINCIPAL */}
      <main className="main-content" style={{ color: 'var(--text-main)', position: 'relative' }}>
        
        <div className="desktop-theme-toggle" onClick={toggleTheme} style={{ position: 'absolute', top: '30px', right: '40px', width: '74px', height: '36px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '30px', boxShadow: 'var(--shadow-card)', zIndex: 10 }}>
            <div className="theme-toggle-bg" style={{ position: 'absolute', left: '4px', width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', transition: 'transform 0.3s ease', transform: theme === 'dark' ? 'translateX(38px)' : 'translateX(0)' }}></div>
            <div style={{ zIndex: 2, width: '28px', display: 'flex', justifyContent: 'center' }}><Icons.Sun size={18} color={theme === 'light' ? 'white' : 'var(--text-muted)'} /></div>
            <div style={{ zIndex: 2, width: '28px', display: 'flex', justifyContent: 'center' }}><Icons.Moon size={18} color={theme === 'dark' ? 'white' : 'var(--text-muted)'} /></div>
        </div>

        {/* --- VISÃO GERAL --- */}
        {view === 'overview' && (
          <div className="fade-in-up">
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '30px' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', marginBottom: '5px' }}>Olá, {userData.name || 'Clipador'}</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Veja seus resultados e ganhos.</p>
                </div>
                <div style={{ 
                    padding: '8px 16px', 
                    borderRadius: '20px', 
                    background: `linear-gradient(135deg, ${currentRank.color}20, transparent)`,
                    border: `1px solid ${currentRank.color}`,
                    color: currentRank.color,
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <Icons.Star size={16} color={currentRank.color} />
                    {currentRank.name}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '40px' }}>
              <StatCard label="Saldo Disponível" value="R$ 0,00" icon={Icons.Wallet} color="var(--success)" />
              <StatCard label="XP Atual" value={userData.xp.toString()} icon={Icons.Target} color={currentRank.color} />
              <StatCard label="Vídeos Postados" value="0" icon={Icons.Play} color="var(--warning)" />
            </div>

            <h2 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>Campanhas Recentes</h2>
            <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
              <p>Você ainda não participou de nenhuma campanha.</p>
              <button onClick={() => changeView('campaigns')} className="btn btn-primary" style={{ marginTop: '15px' }}>Ver Campanhas Disponíveis</button>
            </div>
          </div>
        )}

        {/* --- CAMPANHAS --- */}
        {view === 'campaigns' && (
          <div className="fade-in-up">
            <h1 style={{ fontSize: '1.8rem', marginBottom: '10px' }}>Campanhas Ativas</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Escolha uma campanha e comece a clipar para ganhar XP e dinheiro.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                {campaigns.map(camp => (
                    <div key={camp.id} className="campaign-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{camp.title}</div>
                            {camp.status === 'active' ? (
                                <span style={{ fontSize: '0.8rem', color: 'var(--success)', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>Aberta</span>
                            ) : (
                                <span style={{ fontSize: '0.8rem', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>Lotada</span>
                            )}
                        </div>
                        
                        <div style={{ marginBottom: '15px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            Criador: <span style={{ color: 'var(--text-main)' }}>{camp.creator}</span>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Premiação Total</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--success)' }}>{camp.rewardPool}</div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                            {camp.tags.map(tag => (
                                <span key={tag} style={{ fontSize: '0.75rem', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '12px' }}>{tag}</span>
                            ))}
                        </div>

                        <button 
                            className="btn btn-primary" 
                            style={{ width: '100%', opacity: camp.status === 'full' ? 0.5 : 1 }}
                            disabled={camp.status === 'full'}
                        >
                            {camp.status === 'full' ? 'Lista de Espera' : 'Participar (+50 XP)'}
                        </button>
                    </div>
                ))}
            </div>
          </div>
        )}

        {/* --- EXPERIÊNCIA --- */}
        {view === 'experience' && (
          <div className="fade-in-up">
            <h1 style={{ fontSize: '1.8rem', marginBottom: '30px' }}>Meu Progresso</h1>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
                
                {/* Cartão de Nível */}
                <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <h2 style={{ marginBottom: '20px', color: currentRank.color }}>Elo {currentRank.name}</h2>
                    
                    {/* CORREÇÃO DO ERRO: VERIFICA SE É OBJETO ANTES DE RENDERIZAR */}
                    {typeof progress === 'object' ? (
                        <CircularProgress 
                            value={progress.current} 
                            max={progress.total} 
                            color={currentRank.color} 
                        />
                    ) : (
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)', padding: '40px' }}>Nível Máximo!</div>
                    )}
                    
                    <div style={{ marginTop: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        XP Total: <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{userData.xp}</span>
                        {/* CORREÇÃO AQUI TAMBÉM: Verifica nextRank E se progress é objeto */}
                        {nextRank && typeof progress === 'object' && (
                             <div>Próximo Elo: <span style={{ color: nextRank.color }}>{nextRank.name}</span> em {progress.total - progress.current} XP</div>
                        )}
                    </div>
                </div>

                {/* Regras de XP */}
                <div>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Como ganhar XP?</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {XP_RULES.map((rule, i) => (
                            <div key={i} style={{ 
                                display: 'flex', alignItems: 'center', gap: '15px', 
                                background: 'var(--bg-card)', padding: '15px', borderRadius: '12px', border: '1px solid var(--border)' 
                            }}>
                                <div style={{ background: 'var(--bg-card-hover)', padding: '10px', borderRadius: '8px', color: 'var(--primary)' }}>
                                    <rule.icon size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '500' }}>{rule.action}</div>
                                </div>
                                <div style={{ fontWeight: 'bold', color: 'var(--success)' }}>+{rule.xp} XP</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '30px', background: 'rgba(59, 130, 246, 0.1)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <h4 style={{ color: 'var(--primary)', marginBottom: '5px' }}>Dica Pro</h4>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            Subir de elo desbloqueia vantagens como saques instantâneos e acesso a campanhas exclusivas de marcas famosas.
                        </p>
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* --- RANKINGS, CONFIGURAÇÕES (Mantidos iguais) --- */}
        {view === 'rankings' && (
          <div className="fade-in-up">
            <h1 style={{ fontSize: '1.8rem', marginBottom: '30px' }}>Rankings</h1>
            
            <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Copa Clipay (Exemplo)</h3>
                <span style={{ background: 'var(--primary)', color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>Em Andamento</span>
              </div>
              <div style={{ padding: '20px' }}>
                {[
                  { rank: 1, name: 'PedroCortes', views: '1.2M', prize: 'R$ 500' },
                  { rank: 2, name: 'AnaClips', views: '900K', prize: 'R$ 300' },
                  { rank: 3, name: 'JoãoViral', views: '850K', prize: 'R$ 150' },
                  { rank: 4, name: 'Você', views: '0', prize: '-' },
                ].map((item, i) => (
                  <div key={i} style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', 
                    borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
                    opacity: item.name === 'Você' ? 1 : 0.7,
                    background: item.name === 'Você' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    paddingLeft: item.name === 'Você' ? '10px' : '0',
                    paddingRight: item.name === 'Você' ? '10px' : '0',
                    borderRadius: '8px',
                    color: 'var(--text-main)'
                  }}>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', color: item.rank === 1 ? 'var(--warning)' : item.rank === 2 ? 'var(--text-muted)' : item.rank === 3 ? '#b45309' : 'var(--text-main)', width: '20px' }}>#{item.rank}</span>
                      <span>{item.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', textAlign: 'right' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{item.views} views</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--success)', width: '60px' }}>{item.prize}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'settings' && (
          <div className="fade-in-up" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '30px' }}>Meus Dados</h1>
            
            <div style={{ background: 'var(--bg-card)', padding: '30px', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <form onSubmit={handleSaveSettings}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Nome Completo</label>
                  <div className="dash-input-wrapper">
                    <input type="text" className="dash-input" value={userData.name} onChange={(e) => setUserData({...userData, name: e.target.value})} />
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>E-mail (Não alterável)</label>
                  <div className="dash-input-wrapper" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                    <input type="text" className="dash-input" value={userData.email} disabled style={{ cursor: 'not-allowed' }} />
                  </div>
                </div>

                <div style={{ marginBottom: '25px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--success)', fontWeight: 'bold' }}>Chave PIX (Para Recebimento)</label>
                  <div className="dash-input-wrapper" style={{ borderColor: 'var(--success)', background: 'rgba(16, 185, 129, 0.05)' }}>
                    <input type="text" className="dash-input" placeholder="CPF, E-mail, Telefone ou Aleatória" value={userData.pixKey || ''} onChange={(e) => setUserData({...userData, pixKey: e.target.value})} />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-block" style={{ width: '100%', padding: '15px', fontSize: '1rem' }} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}