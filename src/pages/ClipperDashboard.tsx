import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, serverTimestamp, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// --- SISTEMA DE GAMIFICAÇÃO (Mantido) ---
const RANKS = [
  { name: 'Bronze', min: 0, max: 1000, color: '#cd7f32' },
  { name: 'Prata', min: 1001, max: 3000, color: '#94a3b8' },
  { name: 'Ouro', min: 3001, max: 8000, color: '#fbbf24' },
  { name: 'Diamante', min: 8001, max: 999999, color: '#3b82f6' }
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
  requiredHashtag?: string; // Adicionado para validação
}

interface SubmittedVideo {
    id: string;
    url: string;
    platform: 'youtube' | 'tiktok' | 'instagram' | 'unknown';
    views: number;
    campaignId: string;
    campaignTitle: string;
    status: 'pending' | 'approved' | 'rejected';
    lastUpdated: any;
}

type ProgressType = 100 | { current: number; total: number };

// Adicionado 'my-videos' nas views
type ViewType = 'overview' | 'campaigns' | 'my-videos' | 'experience' | 'rankings' | 'settings';

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}

// --- FUNÇÕES DE API (SIMULAÇÃO/INTEGRAÇÃO) ---

// Função auxiliar para detectar plataforma
const detectPlatform = (url: string): 'youtube' | 'tiktok' | 'instagram' | 'unknown' => {
    if (url.includes('youtube.com/shorts') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com/reel')) return 'instagram';
    return 'unknown';
};

// Esta função simula a busca de dados. 
// Para produção, você substituiria os `setTimeout` por `fetch('https://api.rapidapi.com/...')`
const fetchVideoStats = async (url: string, platform: string) => {
    console.log(`Buscando dados para ${platform}: ${url}`);
    
    // SIMULAÇÃO: Retorna um número aleatório de views para demonstração
    // Substitua isso pela chamada real à API (ex: YouTube Data API ou RapidAPI para TikTok)
    return new Promise<{ views: number }>((resolve) => {
        setTimeout(() => {
            const randomViews = Math.floor(Math.random() * 5000) + 100;
            resolve({ views: randomViews });
        }, 1500);
    });
};

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

const CircularProgress = ({ value, max, color, size = 200, strokeWidth = 15 }: { value: number, max: number, color: string, size?: number, strokeWidth?: number }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percent = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 1;
  const dashOffset = circumference - percent * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{Math.round(percent * 100)}%</div>
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

  // Estados para Meus Vídeos
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [myVideos, setMyVideos] = useState<SubmittedVideo[]>([]);
  const [submittingVideo, setSubmittingVideo] = useState(false);
  const [refreshingVideoId, setRefreshingVideoId] = useState<string | null>(null);

  // Simulando busca de campanhas (Idealmente viria do Firestore)
  const campaigns: Campaign[] = [
    { id: '1', title: 'Copa do Podpah', creator: 'Podpah', rewardPool: 'R$ 5.000', status: 'active', tags: ['Podcast'], requiredHashtag: 'CopaPodpah' },
    { id: '2', title: 'Lançamento Curso Tech', creator: 'DevMaster', rewardPool: 'R$ 2.000', status: 'active', tags: ['Tech'], requiredHashtag: 'DevMaster' },
    { id: '3', title: 'Maratona Fitness', creator: 'IronBerg', rewardPool: 'R$ 10.000', status: 'full', tags: ['Fitness'], requiredHashtag: 'IronBerg' },
  ];

  const getCurrentRank = () => {
    const xp = userData.xp || 0;
    return RANKS.find(r => xp >= r.min && xp <= r.max) || RANKS[RANKS.length - 1];
  };
  const currentRank = getCurrentRank();
  const nextRank = RANKS[RANKS.findIndex(r => r.name === currentRank.name) + 1] || null;

  const getProgressToNextRank = (): ProgressType => {
    if (!nextRank) return 100;
    return { current: (userData.xp || 0) - currentRank.min, total: nextRank.min - currentRank.min };
  };
  const progress = getProgressToNextRank();

  useEffect(() => {
    const fetchUserDataAndVideos = async () => {
      if (auth.currentUser) {
        // Buscar User
        const docRef = doc(db, "users", auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserData({ ...docSnap.data(), xp: docSnap.data().xp || 0 } as UserData);
        }

        // Buscar Vídeos do Usuário
        const q = query(
            collection(db, "videos"), 
            where("userId", "==", auth.currentUser.uid),
            orderBy("lastUpdated", "desc")
        );
        const videoSnaps = await getDocs(q);
        const videosList = videoSnaps.docs.map(d => ({ id: d.id, ...d.data() } as SubmittedVideo));
        setMyVideos(videosList);

        setLoading(false);
      }
    };
    fetchUserDataAndVideos();

    const savedTheme = localStorage.getItem('clipay-theme') as 'dark' | 'light' | null;
    if (savedTheme) { setTheme(savedTheme); document.documentElement.setAttribute('data-theme', savedTheme); }
    else { document.documentElement.setAttribute('data-theme', 'light'); }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('clipay-theme', newTheme);
  };

  const handleLogout = async () => { await signOut(auth); navigate('/login'); };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), { name: userData.name, pixKey: userData.pixKey });
      alert("Dados atualizados!");
    } catch (error) { console.error(error); alert("Erro ao salvar."); } finally { setSaving(false); }
  };

  // --- LÓGICA DE SUBMISSÃO DE VÍDEO ---
  const handleSubmitVideo = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!auth.currentUser) return;

      const platform = detectPlatform(videoUrl);
      if (platform === 'unknown') {
          alert("Link inválido. Aceitamos apenas YouTube Shorts, TikTok ou Instagram Reels.");
          return;
      }

      if (!selectedCampaignId) {
          alert("Selecione uma campanha.");
          return;
      }

      setSubmittingVideo(true);

      try {
          const campaign = campaigns.find(c => c.id === selectedCampaignId);
          
          // 1. Busca estatísticas iniciais (simulado)
          const stats = await fetchVideoStats(videoUrl, platform);

          // 2. Salva no Firestore
          const newVideo = {
            userId: auth.currentUser.uid,
            url: videoUrl,
            platform,
            views: stats.views,
            campaignId: selectedCampaignId,
            campaignTitle: campaign?.title || 'Campanha',
            
            requiredHashtag: campaign?.requiredHashtag || '', 
            requiredMention: campaign?.creator || '',
        
            status: 'pending', // Começa pendente até o robô validar
            validationErrors: [], // Para mostrar o motivo se for rejeitado
            lastUpdated: serverTimestamp(),
            createdAt: serverTimestamp()
          };
        

          const docRef = await addDoc(collection(db, "videos"), newVideo);
          
          // 3. Atualiza estado local e XP (opcional)
          setMyVideos(prev => [{ id: docRef.id, ...newVideo, lastUpdated: new Date() } as SubmittedVideo, ...prev]);
          
          // 4. Dá XP pela ação (Ex: +100xp) - Isso deveria ser no backend, mas faremos no front para o MVP
          const userRef = doc(db, "users", auth.currentUser.uid);
          await updateDoc(userRef, { xp: (userData.xp || 0) + 100 });
          setUserData(prev => ({ ...prev, xp: prev.xp + 100 }));

          setVideoUrl('');
          setSelectedCampaignId('');
          alert(`Vídeo enviado com sucesso! Views iniciais: ${stats.views}`);

      } catch (error) {
          console.error("Erro ao enviar vídeo:", error);
          alert("Erro ao enviar vídeo.");
      } finally {
          setSubmittingVideo(false);
      }
  };

  // --- LÓGICA DE ATUALIZAR VIEWS ---
  const handleRefreshStats = async (video: SubmittedVideo) => {
      setRefreshingVideoId(video.id);
      try {
          // Busca dados novos
          const stats = await fetchVideoStats(video.url, video.platform);
          
          // Atualiza Firestore
          const videoRef = doc(db, "videos", video.id);
          await updateDoc(videoRef, {
              views: stats.views,
              lastUpdated: serverTimestamp()
          });

          // Atualiza Lista Local
          setMyVideos(prev => prev.map(v => v.id === video.id ? { ...v, views: stats.views } : v));
          
      } catch (error) {
          console.error("Erro ao atualizar:", error);
      } finally {
          setRefreshingVideoId(null);
      }
  };

  const changeView = (newView: ViewType) => { setView(newView); setIsMobileMenuOpen(false); };

  return (
    <div className="dashboard-layout">
      <style>{`
        [data-theme="light"] .sidebar-btn:hover { color: var(--primary) !important; background: var(--bg-card-hover); }
        .dash-input-wrapper { display: flex; alignItems: center; background: var(--bg-card-hover); border: 1px solid var(--border); borderRadius: 8px; padding: 0 12px; transition: var(--transition); }
        .dash-input-wrapper:focus-within { border-color: var(--primary); boxShadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .dash-input { background: transparent; border: none; color: var(--text-main); width: 100%; padding: 12px 0; outline: none; }
        .campaign-card { background: var(--bg-card); border: 1px solid var(--border); borderRadius: 12px; padding: 20px; transition: all 0.3s ease; }
        .campaign-card:hover { transform: translateY(-5px); border-color: var(--primary); box-shadow: var(--shadow-card); }
        .video-platform-icon { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; color: white; }
        .youtube-bg { background: #FF0000; }
        .tiktok-bg { background: #000000; }
        .instagram-bg { background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); }
        @media (max-width: 768px) { .desktop-theme-toggle { display: none !important; } }
      `}</style>

      {/* HEADER MOBILE */}
      <div className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', color: 'var(--primary)' }}>
          <Icons.Play fill="var(--primary)" size={24} /> Clipay
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} style={{ background: 'none', border: 'none', color: 'var(--text-main)' }}>
            {isMobileMenuOpen ? <Icons.X size={28} /> : <Icons.Menu size={28} />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && <div className="overlay" onClick={() => setIsMobileMenuOpen(false)}></div>}

      {/* SIDEBAR */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div style={{ padding: '25px 20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
          <Icons.Play fill="var(--primary)" size={28} /> Clipper
        </div>

        <nav className="sidebar-nav">
          <button onClick={() => changeView('overview')} className={`sidebar-btn ${view === 'overview' ? 'active' : ''}`}><Icons.BarChart3 size={20} /> Visão Geral</button>
          <button onClick={() => changeView('campaigns')} className={`sidebar-btn ${view === 'campaigns' ? 'active' : ''}`}><Icons.Briefcase size={20} /> Campanhas</button>
          <button onClick={() => changeView('my-videos')} className={`sidebar-btn ${view === 'my-videos' ? 'active' : ''}`}><Icons.Play size={20} /> Meus Vídeos</button>
          <button onClick={() => changeView('experience')} className={`sidebar-btn ${view === 'experience' ? 'active' : ''}`}><Icons.Target size={20} /> Nível & XP</button>
          <button onClick={() => changeView('rankings')} className={`sidebar-btn ${view === 'rankings' ? 'active' : ''}`}><Icons.Trophy size={20} /> Rankings</button>
          <button onClick={() => changeView('settings')} className={`sidebar-btn ${view === 'settings' ? 'active' : ''}`}><Icons.User size={20} /> Configurações</button>
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="sidebar-btn" style={{ color: 'var(--danger)' }}><Icons.LogOut size={20} /> Sair</button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
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
                <div style={{ padding: '8px 16px', borderRadius: '20px', background: `linear-gradient(135deg, ${currentRank.color}20, transparent)`, border: `1px solid ${currentRank.color}`, color: currentRank.color, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icons.Star size={16} color={currentRank.color} /> {currentRank.name}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '40px' }}>
              <StatCard label="Saldo Disponível" value="R$ 0,00" icon={Icons.Wallet} color="var(--success)" />
              <StatCard label="XP Atual" value={userData.xp.toString()} icon={Icons.Target} color={currentRank.color} />
              <StatCard label="Vídeos Postados" value={myVideos.length.toString()} icon={Icons.Play} color="var(--warning)" />
            </div>

            <div style={{background: 'var(--bg-card)', padding: '30px', borderRadius: '12px', border: '1px solid var(--border)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                    <h2 style={{fontSize: '1.2rem'}}>Últimos Vídeos Enviados</h2>
                    <button onClick={() => changeView('my-videos')} style={{color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer'}}>Ver todos</button>
                </div>
                {myVideos.length === 0 ? (
                    <p style={{color: 'var(--text-muted)', textAlign: 'center'}}>Nenhum vídeo enviado ainda.</p>
                ) : (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                        {myVideos.slice(0, 3).map(video => (
                            <div key={video.id} style={{display: 'flex', justifyContent: 'space-between', padding: '15px', background: 'var(--bg-card-hover)', borderRadius: '8px', alignItems: 'center'}}>
                                <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
                                    <div className={`video-platform-icon ${video.platform === 'youtube' ? 'youtube-bg' : video.platform === 'tiktok' ? 'tiktok-bg' : 'instagram-bg'}`}>
                                        <Icons.Play size={14} />
                                    </div>
                                    <div>
                                        <div style={{fontWeight: '500', fontSize: '0.95rem'}}>{video.campaignTitle}</div>
                                        <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{video.platform.charAt(0).toUpperCase() + video.platform.slice(1)} • {new Date().toLocaleDateString()}</div>
                                    </div>
                                </div>
                                <div style={{fontWeight: 'bold', color: 'var(--success)'}}>{video.views.toLocaleString()} Views</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
          </div>
        )}

        {/* --- CAMPANHAS --- */}
        {view === 'campaigns' && (
          <div className="fade-in-up">
            <h1 style={{ fontSize: '1.8rem', marginBottom: '10px' }}>Campanhas Ativas</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Escolha uma campanha e comece a clipar.</p>
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
                        <div style={{ marginBottom: '15px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Criador: <span style={{ color: 'var(--text-main)' }}>{camp.creator}</span></div>
                        <div style={{ marginBottom: '20px' }}><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Premiação Total</div><div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--success)' }}>{camp.rewardPool}</div></div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>{camp.tags.map(tag => (<span key={tag} style={{ fontSize: '0.75rem', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '12px' }}>{tag}</span>))}</div>
                        <button className="btn btn-primary" style={{ width: '100%', opacity: camp.status === 'full' ? 0.5 : 1 }} disabled={camp.status === 'full'} onClick={() => { setSelectedCampaignId(camp.id); changeView('my-videos'); }}>Participar</button>
                    </div>
                ))}
            </div>
          </div>
        )}

        {/* --- MEUS VÍDEOS (NOVA ABA) --- */}
        {view === 'my-videos' && (
          <div className="fade-in-up">
            <h1 style={{ fontSize: '1.8rem', marginBottom: '10px' }}>Postar e Rastrear</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Envie o link do seu corte publicado (TikTok, Shorts ou Reels) para contabilizar views.</p>

            {/* FORMULÁRIO DE ENVIO */}
            <div style={{ background: 'var(--bg-card)', padding: '30px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '40px' }}>
                <form onSubmit={handleSubmitVideo}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', alignItems: 'end' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Link do Vídeo</label>
                            <div className="dash-input-wrapper">
                                <input 
                                    type="text" 
                                    className="dash-input" 
                                    placeholder="https://www.tiktok.com/@usuario/video/..." 
                                    value={videoUrl}
                                    onChange={(e) => setVideoUrl(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Campanha</label>
                            <div className="dash-input-wrapper">
                                <select 
                                    className="dash-input" 
                                    style={{ cursor: 'pointer' }}
                                    value={selectedCampaignId}
                                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {campaigns.filter(c => c.status === 'active').map(c => (
                                        <option key={c.id} value={c.id}>{c.title}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <button 
                        type="submit" 
                        className="btn btn-primary" 
                        style={{ marginTop: '20px', width: '100%', display: 'flex', justifyContent: 'center', gap: '10px' }}
                        disabled={submittingVideo}
                    >
                        {submittingVideo ? 'Verificando Link...' : <><Icons.Play size={20} /> Rastrear Vídeo</>}
                    </button>
                    <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px', textAlign: 'center'}}>
                        Ao enviar, nosso sistema verifica as views automaticamente a cada 24h. Você também pode atualizar manualmente abaixo.
                    </p>
                </form>
            </div>

            {/* LISTA DE VÍDEOS */}
            <h2 style={{fontSize: '1.4rem', marginBottom: '20px'}}>Vídeos Rastreados</h2>
            <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                {myVideos.length === 0 ? (
                    <div style={{padding: '40px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--text-muted)'}}>
                        Você ainda não cadastrou nenhum vídeo.
                    </div>
                ) : (
                    myVideos.map(video => (
                        <div key={video.id} style={{background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', justifyContent: 'space-between'}}>
                            <div style={{display: 'flex', gap: '15px', alignItems: 'center', minWidth: '300px'}}>
                                <div className={`video-platform-icon ${video.platform === 'youtube' ? 'youtube-bg' : video.platform === 'tiktok' ? 'tiktok-bg' : 'instagram-bg'}`}>
                                    <Icons.Play size={16} />
                                </div>
                                <div style={{overflow: 'hidden'}}>
                                    <div style={{fontWeight: 'bold', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px'}}>
                                        {video.campaignTitle}
                                    </div>
                                    <a href={video.url} target="_blank" rel="noreferrer" style={{fontSize: '0.85rem', color: 'var(--primary)', textDecoration: 'none'}}>
                                        Abrir Link Original ↗
                                    </a>
                                </div>
                            </div>

                            <div style={{display: 'flex', gap: '30px', alignItems: 'center', flex: 1, justifyContent: 'center'}}>
                                <div style={{textAlign: 'center'}}>
                                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Visualizações</div>
                                    <div style={{fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--text-main)'}}>{video.views.toLocaleString()}</div>
                                </div>
                                <div style={{textAlign: 'center'}}>
                                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Status</div>
                                    <div style={{
                                        fontSize: '0.9rem', fontWeight: '600',
                                        color: video.status === 'approved' ? 'var(--success)' : video.status === 'rejected' ? 'var(--danger)' : 'var(--warning)'
                                    }}>
                                        {video.status === 'approved' ? 'Aprovado' : video.status === 'rejected' ? 'Rejeitado' : 'Em Análise'}
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => handleRefreshStats(video)}
                                className="btn btn-outline" 
                                style={{fontSize: '0.85rem', padding: '8px 16px', minWidth: '140px'}}
                                disabled={refreshingVideoId === video.id}
                            >
                                {refreshingVideoId === video.id ? 'Atualizando...' : 'Atualizar Views'}
                            </button>
                        </div>
                    ))
                )}
            </div>
          </div>
        )}

        {/* --- OUTRAS VIEWS (EXPERIENCE, RANKINGS, SETTINGS) --- */}
        {view === 'experience' && (
          <div className="fade-in-up">
            <h1 style={{ fontSize: '1.8rem', marginBottom: '30px' }}>Meu Progresso</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
                <div style={{ background: 'var(--bg-card)', padding: '40px', borderRadius: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <h2 style={{ marginBottom: '20px', color: currentRank.color }}>Elo {currentRank.name}</h2>
                    {typeof progress === 'object' ? (<CircularProgress value={progress.current} max={progress.total} color={currentRank.color} />) : (<div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)', padding: '40px' }}>Nível Máximo!</div>)}
                </div>
                <div>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Como ganhar XP?</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {XP_RULES.map((rule, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'var(--bg-card)', padding: '15px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div style={{ background: 'var(--bg-card-hover)', padding: '10px', borderRadius: '8px', color: 'var(--primary)' }}><rule.icon size={20} /></div>
                                <div style={{ flex: 1 }}><div style={{ fontWeight: '500' }}>{rule.action}</div></div>
                                <div style={{ fontWeight: 'bold', color: 'var(--success)' }}>+{rule.xp} XP</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          </div>
        )}
        
        {view === 'rankings' && (
           <div className="fade-in-up">
             <h1 style={{fontSize: '1.8rem', marginBottom: '20px'}}>Rankings</h1>
             <p style={{color: 'var(--text-muted)'}}>Em breve: Disputas semanais entre clipadores.</p>
           </div>
        )}

        {view === 'settings' && (
          <div className="fade-in-up" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '30px' }}>Meus Dados</h1>
            <div style={{ background: 'var(--bg-card)', padding: '30px', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <form onSubmit={handleSaveSettings}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Nome Completo</label>
                  <div className="dash-input-wrapper"><input type="text" className="dash-input" value={userData.name} onChange={(e) => setUserData({...userData, name: e.target.value})} /></div>
                </div>
                <div style={{ marginBottom: '25px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--success)', fontWeight: 'bold' }}>Chave PIX</label>
                  <div className="dash-input-wrapper" style={{ borderColor: 'var(--success)', background: 'rgba(16, 185, 129, 0.05)' }}><input type="text" className="dash-input" value={userData.pixKey || ''} onChange={(e) => setUserData({...userData, pixKey: e.target.value})} /></div>
                </div>
                <button type="submit" className="btn btn-primary btn-block" style={{ width: '100%', padding: '15px', fontSize: '1rem' }} disabled={saving}>{saving ? 'Salvando...' : 'Salvar Alterações'}</button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}