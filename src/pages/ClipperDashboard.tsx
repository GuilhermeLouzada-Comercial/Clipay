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
  startDate?: string;
  endDate?: string;
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
    createdAt?: any;
}

// Adicionada a view 'campaign-details'
type ViewType = 'overview' | 'campaigns' | 'campaign-details' | 'my-videos' | 'experience' | 'rankings' | 'settings';

// --- HELPER MOCK RANKING ---
const generateMockRanking = (type: 'total' | 'weekly' | 'daily', myName: string) => {
  const users = [
    { name: 'Pedro Cortes', views: 0, avatar: 'PC' },
    { name: 'Maria Clips', views: 0, avatar: 'MC' },
    { name: myName || 'Eu', views: 0, avatar: 'ME', isMe: true },
    { name: 'João Viral', views: 0, avatar: 'JV' },
    { name: 'Ana TikTok', views: 0, avatar: 'AT' },
    { name: 'Carlos Edit', views: 0, avatar: 'CE' },
    { name: 'Julia Reels', views: 0, avatar: 'JR' },
  ];

  const multiplier = type === 'total' ? 50000 : type === 'weekly' ? 10000 : 2000;
  
  const ranking = users.map(u => ({
    ...u,
    views: Math.floor(Math.random() * multiplier) + 500
  })).sort((a, b) => b.views - a.views);

  return ranking;
};

// --- FUNÇÕES AUXILIARES ---
const formatCurrency = (value: number) => {
  if (isNaN(value)) return "R$ 0,00";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (dateString?: string) => {
  if (!dateString) return 'Indefinido';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
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
  <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: 'var(--shadow-card)' }}>
    <div style={{ width: '45px', height: '45px', borderRadius: '10px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}><Icon size={24} /></div>
    <div><div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{label}</div><div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>{value}</div></div>
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

  // Estados da PÁGINA DE DETALHES
  const [selectedCampaignForDetails, setSelectedCampaignForDetails] = useState<Campaign | null>(null);
  const [rankingTab, setRankingTab] = useState<'total' | 'weekly' | 'daily'>('daily');

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
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData({ ...data, xp: data.xp || 0, joinedCampaigns: data.joinedCampaigns || [] } as UserData);
        }

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
            startDate: data.startDate,
            endDate: data.endDate,
            status: data.status,
            createdAt: data.createdAt
          });
        });
        setAvailableCampaigns(fetchedCampaigns);

        const videosQuery = query(collection(db, "videos"), where("userId", "==", auth.currentUser.uid));
        const videosSnap = await getDocs(videosQuery);
        const videosList = videosSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubmittedVideo));
        videosList.sort((a, b) => (b.lastUpdated?.seconds || 0) - (a.lastUpdated?.seconds || 0));
        setMyVideos(videosList);
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };
    fetchAllData();
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

  const handleJoinCampaign = async (campaignId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(!auth.currentUser) return;
    if(!window.confirm("Deseja entrar nessa campanha?")) return;
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { joinedCampaigns: arrayUnion(campaignId), xp: (userData.xp || 0) + 50 });
      setUserData(prev => ({ ...prev, joinedCampaigns: [...(prev.joinedCampaigns || []), campaignId], xp: prev.xp + 50 }));
      alert("Você entrou na campanha com sucesso!");
    } catch (error) { console.error(error); alert("Erro ao entrar na campanha."); }
  };

  // NAVEGAÇÃO PARA DETALHES DA CAMPANHA (SUBSTITUI MODAL)
  const openCampaignDetails = (campaign: Campaign) => {
    setSelectedCampaignForDetails(campaign);
    setView('campaign-details');
    // Scroll para o topo ao mudar de view
    window.scrollTo(0, 0);
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
            status: 'pending' as const, lastUpdated: serverTimestamp(), createdAt: serverTimestamp()
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

  // Filtros de Campanhas
  const myCampaignsList = availableCampaigns.filter(c => userData.joinedCampaigns?.includes(c.id));
  const availableList = availableCampaigns.filter(c => !userData.joinedCampaigns?.includes(c.id));

  if (loading) return <div style={{height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-dark)', color: 'var(--text-main)'}}>Carregando...</div>;

  return (
    <div className="dashboard-layout">
      <style>{`
        [data-theme="light"] .sidebar-btn:hover { color: var(--primary) !important; background: var(--bg-card-hover); }
        .dash-input-wrapper { display: flex; alignItems: center; background: var(--bg-card-hover); border: 1px solid var(--border); borderRadius: 8px; padding: 0 12px; transition: var(--transition); }
        .dash-input-wrapper:focus-within { border-color: var(--primary); boxShadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
        .dash-input { background: transparent; border: none; color: var(--text-main); width: 100%; padding: 12px 0; outline: none; }
        
        /* GRID CUSTOMIZADO - RESOLVE O PROBLEMA DE CARD GIGANTE */
        .campaign-grid {
            display: grid;
            /* auto-fill: preenche o máximo de colunas que der, se sobrar espaço no final da linha, deixa vazio (não estica) */
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
        }

        .campaign-card { background: var(--bg-card); border: 1px solid var(--border); borderRadius: 12px; padding: 25px; transition: all 0.3s ease; display: flex; height: 100%; min-height: 280px; position: relative; }
        .campaign-card:hover { transform: translateY(-5px); border-color: var(--primary); box-shadow: var(--shadow-card); }
        
        .campaign-card.clickable { cursor: pointer; border-left: 4px solid var(--primary); }
        .campaign-card.clickable:hover { background: var(--bg-card-hover); }

        .video-platform-icon { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; color: white; }
        .youtube-bg { background: #FF0000; }
        .tiktok-bg { background: #000000; }
        .instagram-bg { background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); }
        .requirement-box { background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); color: #d97706; padding: 15px; border-radius: 8px; margin-top: 15px; font-size: 0.9rem; }
        [data-theme="dark"] .requirement-box { color: #fbbf24; }
        @media (max-width: 768px) { .desktop-theme-toggle { display: none !important; } }

        /* RANKING NA PÁGINA DE DETALHES */
        .rank-tab-container { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
        .rank-tab { background: none; border: none; padding: 10px 20px; cursor: pointer; color: var(--text-muted); font-weight: 600; border-radius: 8px; transition: all 0.2s; font-size: 1rem; }
        .rank-tab:hover { background: var(--bg-card-hover); color: var(--text-main); }
        .rank-tab.active { background: var(--primary); color: white; }
        
        .ranking-list { display: flex; flexDirection: column; gap: 10px; }
        .ranking-item { display: flex; alignItems: center; justify-content: space-between; padding: 20px; background: var(--bg-card-hover); border-radius: 8px; border: 1px solid var(--border); transition: transform 0.2s; }
        .ranking-item:hover { transform: translateX(5px); border-color: var(--primary); }
        .ranking-pos { width: 40px; font-weight: bold; color: var(--text-muted); font-size: 1.1rem; }
        .ranking-name { flex: 1; font-weight: 600; display: flex; align-items: center; gap: 15px; font-size: 1.05rem; }
        .ranking-score { font-weight: bold; color: var(--success); font-size: 1.1rem; }
        .medal { margin-right: 5px; font-size: 1.2rem; }
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
          <button onClick={() => changeView('campaigns')} className={`sidebar-btn ${view === 'campaigns' || view === 'campaign-details' ? 'active' : ''}`}><Icons.Briefcase size={20} /> Campanhas</button>
          <button onClick={() => changeView('my-videos')} className={`sidebar-btn ${view === 'my-videos' ? 'active' : ''}`}><Icons.Play size={20} /> Meus Vídeos</button>
          <button onClick={() => changeView('experience')} className={`sidebar-btn ${view === 'experience' ? 'active' : ''}`}><Icons.Target size={20} /> Nível & XP</button>
          <button onClick={() => changeView('settings')} className={`sidebar-btn ${view === 'settings' ? 'active' : ''}`}><Icons.User size={20} /> Configurações</button>
        </nav>
        <div className="sidebar-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <button onClick={handleLogout} className="sidebar-btn" style={{ color: 'var(--danger)', width: 'auto', flex: 1 }}><Icons.LogOut size={20} /> Sair</button>
          <div onClick={toggleTheme} style={{ width: '60px', height: '32px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', borderRadius: '30px', position: 'relative', marginLeft: '10px' }}>
            <div className="theme-toggle-bg" style={{ position: 'absolute', left: '4px', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', transition: 'transform 0.3s ease', transform: theme === 'dark' ? 'translateX(28px)' : 'translateX(0)' }}></div>
            <div style={{ zIndex: 2, width: '24px', display: 'flex', justifyContent: 'center' }}><Icons.Sun size={14} color={theme === 'light' ? 'white' : 'var(--text-muted)'} /></div>
            <div style={{ zIndex: 2, width: '24px', display: 'flex', justifyContent: 'center' }}><Icons.Moon size={14} color={theme === 'dark' ? 'white' : 'var(--text-muted)'} /></div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="desktop-theme-toggle" onClick={toggleTheme} style={{ position: 'absolute', top: '30px', right: '40px', width: '74px', height: '36px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '30px', boxShadow: 'var(--shadow-card)', zIndex: 10 }}>
            <div className="theme-toggle-bg" style={{ position: 'absolute', left: '4px', width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', transition: 'transform 0.3s ease', transform: theme === 'dark' ? 'translateX(38px)' : 'translateX(0)' }}></div>
            <div style={{ zIndex: 2, width: '28px', display: 'flex', justifyContent: 'center' }}><Icons.Sun size={18} color={theme === 'light' ? 'white' : 'var(--text-muted)'} /></div>
            <div style={{ zIndex: 2, width: '28px', display: 'flex', justifyContent: 'center' }}><Icons.Moon size={18} color={theme === 'dark' ? 'white' : 'var(--text-muted)'} /></div>
        </div>

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
          </div>
        )}

        {view === 'campaigns' && (
          <div className="fade-in-up">
            {/* SEÇÃO 1: MINHAS CAMPANHAS */}
            <h2 style={{ fontSize: '1.4rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icons.CheckCircle size={24} color="var(--success)" /> Minhas Campanhas (Clique para ver)
            </h2>
            
            {myCampaignsList.length === 0 ? (
                <p style={{color: 'var(--text-muted)', marginBottom: '40px'}}>Você ainda não entrou em nenhuma campanha.</p>
            ) : (
                <div className="campaign-grid" style={{ marginBottom: '50px' }}>
                    {myCampaignsList.map(camp => (
                        <div key={camp.id} className="campaign-card clickable" onClick={() => openCampaignDetails(camp)}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', lineHeight: '1.3' }}>{camp.title}</div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--success)', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>Participando</span>
                                </div>
                                <div style={{fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '10px'}}>
                                    {camp.description.length > 80 ? camp.description.substring(0, 80) + '...' : camp.description}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '15px' }}>
                                    <span style={{ fontSize: '0.75rem', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '12px', color: 'var(--primary)' }}>#{camp.requiredHashtag}</span>
                                    {camp.endDate && <span style={{ fontSize: '0.75rem', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '12px' }}><Icons.Clock size={10} /> Fim: {formatDate(camp.endDate)}</span>}
                                </div>
                            </div>
                            <div className="btn btn-primary" style={{ marginTop: 'auto' }}>
                                Ver Ranking e Detalhes →
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* SEÇÃO 2: CAMPANHAS DISPONÍVEIS */}
            <h2 style={{ fontSize: '1.4rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                <Icons.Briefcase size={24} color="var(--primary)" /> Disponíveis para Entrar
            </h2>

            {availableList.length === 0 ? (
                <p style={{color: 'var(--text-muted)'}}>Não há novas campanhas no momento.</p>
            ) : (
                <div className="campaign-grid">
                    {availableList.map(camp => (
                        <div key={camp.id} className="campaign-card">
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', lineHeight: '1.3' }}>{camp.title}</div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-card-hover)', padding: '4px 8px', borderRadius: '4px' }}>Disponível</span>
                                </div>
                                <div style={{ marginBottom: '15px', fontSize: '0.9rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{camp.description}</div>
                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Orçamento Total / CPM</div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--success)' }}>{formatCurrency(camp.budget)}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>({formatCurrency(camp.cpm)}/1k views)</div>
                                    </div>
                                </div>
                                {camp.endDate && <div style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '15px'}}><Icons.Clock size={12} /> Prazo: {formatDate(camp.startDate)} até {formatDate(camp.endDate)}</div>}
                            </div>
                            <button className="btn btn-primary" style={{ width: '100%', marginTop: 'auto' }} onClick={(e) => handleJoinCampaign(camp.id, e)}>Entrar na Campanha</button>
                        </div>
                    ))}
                </div>
            )}
          </div>
        )}

        {/* --- PÁGINA DE DETALHES DA CAMPANHA (NOVA) --- */}
        {view === 'campaign-details' && selectedCampaignForDetails && (
            <div className="fade-in-up">
                <button 
                    onClick={() => setView('campaigns')} 
                    style={{background: 'none', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', marginBottom: '20px', fontSize: '0.9rem'}}
                >
                    <Icons.ArrowRight size={16} style={{transform: 'rotate(180deg)'}} /> Voltar para Campanhas
                </button>

                {/* Cabeçalho da Campanha */}
                <div style={{background: 'var(--bg-card)', padding: '30px', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '30px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px', marginBottom: '20px'}}>
                        <div>
                            <h1 style={{fontSize: '2rem', marginBottom: '10px'}}>{selectedCampaignForDetails.title}</h1>
                            <div style={{display: 'flex', gap: '15px', color: 'var(--text-muted)', fontSize: '0.9rem'}}>
                                <span><Icons.Clock size={14} /> Início: {formatDate(selectedCampaignForDetails.startDate)}</span>
                                <span><Icons.Clock size={14} /> Fim: {formatDate(selectedCampaignForDetails.endDate)}</span>
                            </div>
                        </div>
                        <div style={{textAlign: 'right'}}>
                            <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>CPM da Campanha</div>
                            <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)'}}>{formatCurrency(selectedCampaignForDetails.cpm)} <span style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>/1k views</span></div>
                        </div>
                    </div>

                    <div style={{background: 'var(--bg-card-hover)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '20px'}}>
                        <h3 style={{fontSize: '1.1rem', marginBottom: '10px'}}>Regras e Descrição</h3>
                        <p style={{color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '15px'}}>{selectedCampaignForDetails.description}</p>
                        <div style={{display: 'flex', gap: '20px', flexWrap: 'wrap'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: '600'}}>
                                <Icons.AlertCircle size={18} /> Hashtag: #{selectedCampaignForDetails.requiredHashtag}
                            </div>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: '600'}}>
                                <Icons.User size={18} /> Marcar: @{selectedCampaignForDetails.requiredMention}
                            </div>
                        </div>
                    </div>

                    <div style={{textAlign: 'center'}}>
                        <button className="btn btn-primary" onClick={() => {
                            setSelectedCampaignId(selectedCampaignForDetails.id);
                            changeView('my-videos');
                        }} style={{padding: '12px 30px', fontSize: '1rem'}}>
                            <Icons.Play size={20} style={{marginRight: '8px'}} /> Enviar Vídeo para essa Campanha
                        </button>
                    </div>
                </div>

                {/* Seção de Ranking */}
                <h2 style={{fontSize: '1.5rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <Icons.Trophy size={28} color="#fbbf24" /> Ranking da Campanha
                </h2>
                
                <div style={{background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)', padding: '20px'}}>
                    <div className="rank-tab-container">
                        <button className={`rank-tab ${rankingTab === 'total' ? 'active' : ''}`} onClick={() => setRankingTab('total')}>Total</button>
                        <button className={`rank-tab ${rankingTab === 'weekly' ? 'active' : ''}`} onClick={() => setRankingTab('weekly')}>Semanal</button>
                        <button className={`rank-tab ${rankingTab === 'daily' ? 'active' : ''}`} onClick={() => setRankingTab('daily')}>Diário</button>
                    </div>

                    <div className="ranking-list">
                        {generateMockRanking(rankingTab, userData.name).map((user, index) => (
                            <div key={index} className="ranking-item" style={user.isMe ? {borderColor: 'var(--primary)', background: 'rgba(59, 130, 246, 0.1)'} : {}}>
                                <div className="ranking-pos">
                                    {index === 0 ? <span className="medal">🥇</span> : 
                                     index === 1 ? <span className="medal">🥈</span> : 
                                     index === 2 ? <span className="medal">🥉</span> : 
                                     `#${index + 1}`}
                                </div>
                                <div className="ranking-name">
                                    <div style={{width: '36px', height: '36px', borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold'}}>{user.avatar}</div>
                                    {user.name}
                                </div>
                                <div className="ranking-score">{user.views.toLocaleString()} <span style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal'}}>Views</span></div>
                            </div>
                        ))}
                    </div>
                </div>
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
                                <select className="dash-input" style={{ cursor: 'pointer', color: selectedCampaignId ? 'var(--text-main)' : 'var(--text-muted)' }} value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)} required>
                                    <option value="" disabled>Selecione...</option>
                                    {availableCampaigns.filter(c => userData.joinedCampaigns?.includes(c.id)).map(c => (<option key={c.id} value={c.id} style={{color: 'black'}}>{c.title}</option>))}
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
                                        {video.status === 'approved' ? video.views.toLocaleString() : <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>---</span>}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => handleRefreshVideo(video)} disabled={refreshingId === video.id} className="btn btn-outline" style={{fontSize: '0.85rem', padding: '8px 12px', display: 'flex', gap: '5px', opacity: refreshingId === video.id ? 0.7 : 1}}>
                                <Icons.Clock size={16} /> {refreshingId === video.id ? 'Atualizando...' : 'Atualizar Views'}
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