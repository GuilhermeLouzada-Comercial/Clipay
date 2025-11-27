import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp, 
  arrayUnion 
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// --- SISTEMA DE GAMIFICAÇÃO ---
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
  joinedCampaigns?: string[];
}

interface Campaign {
  id: string;
  title: string;
  creatorId: string;
  budget: number;
  cpm: number;
  description: string;
  requiredHashtag: string;
  requiredMention: string;
  status: 'active' | 'full' | 'finished' | 'pending_payment';
  createdAt?: any;
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
    createdAt?: any; // Adicionado para ordenação
}

type ViewType = 'overview' | 'campaigns' | 'my-videos' | 'experience' | 'rankings' | 'settings';

// --- FUNÇÕES AUXILIARES ---

const formatCurrency = (value: number) => {
  if (isNaN(value)) return "R$ 0,00";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const detectPlatform = (url: string): 'youtube' | 'tiktok' | 'instagram' | 'unknown' => {
    if (url.includes('youtube.com/shorts') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com/reel')) return 'instagram';
    return 'unknown';
};

const fetchVideoStats = async (url: string, platform: string, currentViews = 0) => {
    return new Promise<{ views: number }>((resolve) => {
        setTimeout(() => {
            const newViews = currentViews + Math.floor(Math.random() * 500) + 50; 
            resolve({ views: newViews });
        }, 1500);
    });
};

const StatCard = ({ label, value, icon: Icon, color }: any) => (
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
  const [userData, setUserData] = useState<UserData>({ name: '', pixKey: '', email: '', xp: 0, joinedCampaigns: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
  const [myVideos, setMyVideos] = useState<SubmittedVideo[]>([]);
  
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [submittingVideo, setSubmittingVideo] = useState(false);
  
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const getCurrentRank = () => {
    const xp = userData.xp || 0;
    return RANKS.find(r => xp >= r.min && xp <= r.max) || RANKS[RANKS.length - 1];
  };
  const currentRank = getCurrentRank();
  const nextRank = RANKS[RANKS.findIndex(r => r.name === currentRank.name) + 1] || null;
  const progress = nextRank ? { current: (userData.xp || 0) - currentRank.min, total: nextRank.min - currentRank.min } : 100;

  useEffect(() => {
    const fetchAllData = async () => {
      if (!auth.currentUser) return;
      try {
        // 1. Dados do Usuário
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData({ ...data, xp: data.xp || 0, joinedCampaigns: data.joinedCampaigns || [] } as UserData);
        }

        // 2. Campanhas
        const q = query(collection(db, "campaigns"), where("status", "==", "active"));
        const querySnapshot = await getDocs(q);
        const fetchedCampaigns: Campaign[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          fetchedCampaigns.push({
            id: doc.id,
            title: data.title,
            creatorId: data.creatorId,
            budget: Number(data.budget),
            cpm: Number(data.cpm),
            description: data.description || "",
            requiredHashtag: data.requiredHashtag || "",
            requiredMention: data.requiredMention || "",
            status: data.status,
            createdAt: data.createdAt
          });
        });
        setAvailableCampaigns(fetchedCampaigns);

        // 3. Meus Vídeos (Ordenação no CLIENTE para evitar erro de índice do Firestore)
        const videosQuery = query(
            collection(db, "videos"), 
            where("userId", "==", auth.currentUser.uid)
            // orderBy("lastUpdated", "desc") REMOVIDO PARA EVITAR ERRO DE INDEX
        );
        const videosSnap = await getDocs(videosQuery);
        
        const videosList = videosSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubmittedVideo));
        
        // Ordena via Javascript (Mais seguro para protótipo)
        videosList.sort((a, b) => {
            const dateA = a.lastUpdated?.seconds || 0;
            const dateB = b.lastUpdated?.seconds || 0;
            return dateB - dateA;
        });

        setMyVideos(videosList);

      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchAllData();

    // Tema
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

  const handleJoinCampaign = async (campaignId: string) => {
    if(!auth.currentUser) return;
    if(!window.confirm("Deseja entrar nessa campanha?")) return;
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { joinedCampaigns: arrayUnion(campaignId), xp: (userData.xp || 0) + 50 });
      setUserData(prev => ({ ...prev, joinedCampaigns: [...(prev.joinedCampaigns || []), campaignId], xp: prev.xp + 50 }));
      alert("Você entrou na campanha com sucesso!");
      setSelectedCampaignId(campaignId);
      setView('my-videos');
    } catch (error) { console.error(error); alert("Erro ao entrar na campanha."); }
  };

  const handleSubmitVideo = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!auth.currentUser) return;
      const platform = detectPlatform(videoUrl);
      if (platform === 'unknown') { alert("Link inválido. Use YouTube Shorts, TikTok ou Instagram."); return; }
      if (!selectedCampaignId) { alert("Selecione uma campanha."); return; }
      
      const isDuplicate = myVideos.some(v => v.url === videoUrl);
      if (isDuplicate) { alert("Link já enviado."); return; }

      setSubmittingVideo(true);
      try {
          const campaign = availableCampaigns.find(c => c.id === selectedCampaignId);
          if (!campaign) throw new Error("Campanha não encontrada");

          const stats = await fetchVideoStats(videoUrl, platform, 0);

          const newVideo = {
            userId: auth.currentUser.uid, url: videoUrl, platform, views: stats.views,
            campaignId: selectedCampaignId, campaignTitle: campaign.title,
            requiredHashtag: campaign.requiredHashtag, requiredMention: campaign.requiredMention,
            status: 'pending' as const, 
            lastUpdated: serverTimestamp(), createdAt: serverTimestamp()
          };
        
          const docRef = await addDoc(collection(db, "videos"), newVideo);
          
          setMyVideos(prev => [{ id: docRef.id, ...newVideo, lastUpdated: new Date() } as SubmittedVideo, ...prev]);
          const userRef = doc(db, "users", auth.currentUser.uid);
          await updateDoc(userRef, { xp: (userData.xp || 0) + 100 });
          setUserData(prev => ({ ...prev, xp: prev.xp + 100 }));
          setVideoUrl(''); alert(`Vídeo enviado com sucesso!`);
      } catch (error) { console.error(error); alert("Erro ao enviar vídeo."); } finally { setSubmittingVideo(false); }
  };

  const handleRefreshVideo = async (video: SubmittedVideo) => {
    setRefreshingId(video.id);
    try {
      const stats = await fetchVideoStats(video.url, video.platform, video.views);
      const videoRef = doc(db, "videos", video.id);
      await updateDoc(videoRef, { views: stats.views, lastUpdated: serverTimestamp() });
      setMyVideos(prev => prev.map(v => v.id === video.id ? { ...v, views: stats.views, lastUpdated: new Date() } : v));
    } catch (error) { console.error("Erro:", error); alert("Falha ao atualizar."); } finally { setRefreshingId(null); }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    if (!auth.currentUser) return;
    try { await updateDoc(doc(db, "users", auth.currentUser.uid), { name: userData.name, pixKey: userData.pixKey }); alert("Salvo!"); } 
    catch (error) { console.error(error); alert("Erro."); } finally { setSaving(false); }
  };

  const changeView = (newView: ViewType) => { setView(newView); setIsMobileMenuOpen(false); };
  const getSelectedCampaignDetails = () => availableCampaigns.find(c => c.id === selectedCampaignId);

  if (loading) return <div style={{height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-dark)', color: 'var(--text-main)'}}>Carregando...</div>;

  return (
    <div className="dashboard-layout">
      <style>{`
        [data-theme="light"] .sidebar-btn:hover { color: var(--primary) !important; background: var(--bg-card-hover); }
        .dash-input-wrapper { display: flex; alignItems: center; background: var(--bg-card-hover); border: 1px solid var(--border); borderRadius: 8px; padding: 0 12px; transition: var(--transition); }
        .dash-input-wrapper:focus-within { border-color: var(--primary); boxShadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .dash-input { background: transparent; border: none; color: var(--text-main); width: 100%; padding: 12px 0; outline: none; }
        .campaign-card { background: var(--bg-card); border: 1px solid var(--border); borderRadius: 12px; padding: 25px; transition: all 0.3s ease; display: flex; flexDirection: column; justify-content: center; height: 100%; min-height: 280px; }
        .campaign-card:hover { transform: translateY(-5px); border-color: var(--primary); box-shadow: var(--shadow-card); }
        .video-platform-icon { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; color: white; }
        .youtube-bg { background: #FF0000; }
        .tiktok-bg { background: #000000; }
        .instagram-bg { background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); }
        .requirement-box { background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); color: #d97706; padding: 15px; border-radius: 8px; margin-top: 15px; font-size: 0.9rem; }
        [data-theme="dark"] .requirement-box { color: #fbbf24; }
        }
      `}</style>

      {/* HEADER MOBILE */}
      <div className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', color: 'var(--primary)' }}>
          <Icons.Play fill="var(--primary)" size={24} /> Clipay
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} style={{ background: 'none', border: 'none', color: 'var(--text-main)' }}>
            {isMobileMenuOpen ? <Icons.X size={28} /> : <Icons.Menu size={28} />}
        </button>
      </div>

      {isMobileMenuOpen && <div className="overlay" onClick={() => setIsMobileMenuOpen(false)}></div>}

      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div style={{ padding: '25px 20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
          <Icons.Play fill="var(--primary)" size={28} /> Clipper
        </div>
        <nav className="sidebar-nav">
          <button onClick={() => changeView('overview')} className={`sidebar-btn ${view === 'overview' ? 'active' : ''}`}><Icons.BarChart3 size={20} /> Visão Geral</button>
          <button onClick={() => changeView('campaigns')} className={`sidebar-btn ${view === 'campaigns' ? 'active' : ''}`}><Icons.Briefcase size={20} /> Campanhas</button>
          <button onClick={() => changeView('my-videos')} className={`sidebar-btn ${view === 'my-videos' ? 'active' : ''}`}><Icons.Play size={20} /> Meus Vídeos</button>
          <button onClick={() => changeView('experience')} className={`sidebar-btn ${view === 'experience' ? 'active' : ''}`}><Icons.Target size={20} /> Nível & XP</button>
          <button onClick={() => changeView('settings')} className={`sidebar-btn ${view === 'settings' ? 'active' : ''}`}><Icons.User size={20} /> Configurações</button>
        </nav>
        
        {/* Toggle de Tema e Logout no Rodapé da Sidebar */}
        <div className="sidebar-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <button onClick={handleLogout} className="sidebar-btn" style={{ color: 'var(--danger)', width: 'auto', flex: 1 }}><Icons.LogOut size={20} /> Sair</button>
          
          {/* Toggle de Tema dentro do Menu (visível no mobile e desktop) */}
          <div onClick={toggleTheme} style={{ width: '60px', height: '32px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', borderRadius: '30px', position: 'relative', marginLeft: '10px' }}>
            <div className="theme-toggle-bg" style={{ position: 'absolute', left: '4px', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', transition: 'transform 0.3s ease', transform: theme === 'dark' ? 'translateX(28px)' : 'translateX(0)' }}></div>
            <div style={{ zIndex: 2, width: '24px', display: 'flex', justifyContent: 'center' }}><Icons.Sun size={14} color={theme === 'light' ? 'white' : 'var(--text-muted)'} /></div>
            <div style={{ zIndex: 2, width: '24px', display: 'flex', justifyContent: 'center' }}><Icons.Moon size={14} color={theme === 'dark' ? 'white' : 'var(--text-muted)'} /></div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {/* ... (Visão Geral e Campanhas mantidos iguais) ... */}
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
              <StatCard label="Campanhas Participando" value={(userData.joinedCampaigns?.length || 0).toString()} icon={Icons.Briefcase} color="var(--primary)" />
            </div>
             {availableCampaigns.length > 0 && userData.joinedCampaigns?.length === 0 && (
               <div style={{background: 'var(--bg-card)', padding: '30px', borderRadius: '12px', border: '1px solid var(--primary)', textAlign: 'center', marginBottom: '30px'}}>
                  <h3 style={{marginBottom: '10px'}}>Comece sua jornada!</h3>
                  <p style={{color: 'var(--text-muted)', marginBottom: '20px'}}>Você ainda não entrou em nenhuma campanha.</p>
                  <button className="btn btn-primary" onClick={() => changeView('campaigns')}>Ver Campanhas Disponíveis</button>
               </div>
            )}
          </div>
        )}

        {view === 'campaigns' && (
          <div className="fade-in-up">
            <h1 style={{ fontSize: '1.8rem', marginBottom: '10px' }}>Campanhas Disponíveis</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Escolha um desafio e clique em Entrar.</p>
            {availableCampaigns.length === 0 ? (
                <div style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}><Icons.Briefcase size={40} style={{marginBottom: '10px', opacity: 0.5}} /><p>Nenhuma campanha ativa no momento.</p></div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    {availableCampaigns.map(camp => {
                        const isJoined = userData.joinedCampaigns?.includes(camp.id);
                        return (
                            <div key={camp.id} className="campaign-card">
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', lineHeight: '1.3' }}>{camp.title}</div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>Aberta</span>
                                    </div>
                                    <div style={{ marginBottom: '15px', fontSize: '0.9rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{camp.description}</div>
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Orçamento Total / CPM</div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--success)' }}>{formatCurrency(camp.budget)}</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>({formatCurrency(camp.cpm)}/1k views)</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '25px' }}>
                                        {camp.requiredHashtag && <span style={{ fontSize: '0.75rem', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '12px', color: 'var(--primary)' }}>#{camp.requiredHashtag}</span>}
                                        {camp.requiredMention && <span style={{ fontSize: '0.75rem', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '12px' }}>@{camp.requiredMention}</span>}
                                    </div>

                                  <div style={{ marginTop: 'auto' }}>
                                    {isJoined ? (
                                        <button className="btn btn-outline" style={{ width: '100%', borderColor: 'var(--success)', color: 'var(--success)', cursor: 'default' }} onClick={() => { setSelectedCampaignId(camp.id); changeView('my-videos'); }}>
                                            <Icons.CheckCircle size={16} style={{marginRight: '5px'}}/> Você participa
                                        </button>
                                    ) : (
                                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => handleJoinCampaign(camp.id)}>Entrar na Campanha</button>
                                    )}
                                  </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
          </div>
        )}

        {view === 'my-videos' && (
          <div className="fade-in-up">
            <h1 style={{ fontSize: '1.8rem', marginBottom: '10px' }}>Postar e Rastrear</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Envie o link do seu corte publicado.</p>
            <div style={{ background: 'var(--bg-card)', padding: '30px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '40px' }}>
                <form onSubmit={handleSubmitVideo}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Selecione a Campanha que você participa</label>
                            <div className="dash-input-wrapper">
                                <select 
                                    className="dash-input" 
                                    style={{ cursor: 'pointer', color: selectedCampaignId ? 'var(--text-main)' : 'var(--text-muted)' }}
                                    value={selectedCampaignId}
                                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {availableCampaigns.filter(c => userData.joinedCampaigns?.includes(c.id)).map(c => (
                                        <option key={c.id} value={c.id} style={{color: 'black'}}>{c.title}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {selectedCampaignId && (() => {
                            const details = getSelectedCampaignDetails();
                            if(details) {
                                return (
                                    <div className="requirement-box">
                                        <div style={{fontWeight: 'bold', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px'}}><Icons.AlertCircle size={18} /> Atenção às Regras Obrigatórias:</div>
                                        <ul style={{listStyle: 'inside', marginLeft: '5px'}}>
                                            <li>Use a hashtag: <span style={{fontWeight: 'bold', textDecoration: 'underline'}}>#{details.requiredHashtag}</span></li>
                                            <li>Marque o perfil: <span style={{fontWeight: 'bold', textDecoration: 'underline'}}>@{details.requiredMention}</span></li>
                                        </ul>
                                    </div>
                                )
                            }
                        })()}
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Link do Vídeo</label>
                            <div className="dash-input-wrapper">
                                <input type="text" className="dash-input" placeholder="Cole o link aqui..." value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} required />
                            </div>
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ marginTop: '20px', width: '100%', display: 'flex', justifyContent: 'center', gap: '10px' }} disabled={submittingVideo || !selectedCampaignId}>
                        {submittingVideo ? 'Validando...' : <><Icons.Play size={20} /> Registrar Vídeo</>}
                    </button>
                </form>
            </div>

            <h2 style={{fontSize: '1.4rem', marginBottom: '20px'}}>Meus Envios</h2>
            <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                {myVideos.length === 0 ? (
                    <div style={{padding: '40px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--text-muted)'}}>Nenhum vídeo registrado.</div>
                ) : (
                    myVideos.map(video => (
                        <div key={video.id} style={{background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', justifyContent: 'space-between'}}>
                            <div style={{display: 'flex', gap: '15px', alignItems: 'center', minWidth: '300px', flex: 1}}>
                                <div className={`video-platform-icon ${video.platform === 'youtube' ? 'youtube-bg' : video.platform === 'tiktok' ? 'tiktok-bg' : 'instagram-bg'}`}><Icons.Play size={16} /></div>
                                <div style={{overflow: 'hidden'}}>
                                    <div style={{fontWeight: 'bold', fontSize: '1rem'}}>{video.campaignTitle}</div>
                                    <div style={{display: 'flex', gap: '10px', fontSize: '0.85rem'}}>
                                        <a href={video.url} target="_blank" rel="noreferrer" style={{color: 'var(--primary)', textDecoration: 'none'}}>Abrir Link ↗</a>
                                    </div>
                                </div>
                            </div>

                            <div style={{display: 'flex', gap: '40px', alignItems: 'center', margin: '0 20px'}}>
                                <div style={{textAlign: 'center'}}>
                                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Status</div>
                                    <div style={{fontWeight: 'bold', color: video.status === 'approved' ? 'var(--success)' : video.status === 'rejected' ? 'var(--danger)' : 'var(--warning)'}}>
                                        {video.status === 'approved' ? 'Aprovado' : video.status === 'rejected' ? 'Rejeitado' : 'Em Análise'}
                                    </div>
                                </div>
                                <div style={{textAlign: 'center'}}>
                                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Visualizações</div>
                                    <div style={{fontSize: '1.3rem', fontWeight: 'bold'}}>
                                        {/* LÓGICA DE OCULTAR VIEWS SE NÃO APROVADO */}
                                        {video.status === 'approved' ? video.views.toLocaleString() : <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>---</span>}
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => handleRefreshVideo(video)}
                                disabled={refreshingId === video.id}
                                className="btn btn-outline"
                                style={{fontSize: '0.85rem', padding: '8px 12px', display: 'flex', gap: '5px', opacity: refreshingId === video.id ? 0.7 : 1}}
                            >
                                <Icons.Clock size={16} />
                                {refreshingId === video.id ? 'Atualizando...' : 'Atualizar Views'}
                            </button>
                        </div>
                    ))
                )}
            </div>
          </div>
        )}

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