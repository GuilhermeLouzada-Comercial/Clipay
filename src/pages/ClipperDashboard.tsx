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
  arrayUnion,
  orderBy,
  limit,
  writeBatch,
  increment,
  Timestamp
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
];

// --- TIPOS ---
interface UserData {
  uid?: string;
  name: string;
  pixKey: string;
  email: string;
  xp: number;
  saldo: number;
  joinedCampaigns?: string[];
  role?: string;
}

interface Campaign {
  id: string;
  title: string;
  creatorId: string;
  budget: number;
  description: string;
  requiredHashtag: string;
  requiredMention: string;
  status: 'active' | 'full' | 'finished' | 'pending_payment';
  startDate: string;
  endDate: string;
  nextPayout?: any; 
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
    createdAt: any;
    userId: string;
}

interface RankingItem {
    userId: string;
    name: string;
    avatar: string;
    totalViews: number;
    videoCount: number;
    isMe: boolean;
    sharePercentage: number;
    estimatedEarnings: number;
}

interface GlobalRankingItem {
    name: string;
    xp: number;
    isMe: boolean;
    rankLevel: string;
}

// --- FUNÇÕES AUXILIARES ---

const formatCurrency = (value: number) => {
  if (isNaN(value)) return "R$ 0,00";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (dateString?: string) => {
  if (!dateString) return 'Indefinido';
  try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
  } catch (e) {
      return dateString;
  }
};

const getDaysDiff = (startInput: string | Date, endInput: string | Date) => {
  const start = new Date(startInput);
  const end = new Date(endInput);
  const diff = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diff / (1000 * 3600 * 24)) || 1;
};

// Nova função para calcular dias restantes para UI
const getDaysRemaining = (endStr: string) => {
    const end = new Date(endStr);
    const now = new Date();
    // Zera as horas para comparar apenas dias
    end.setHours(23, 59, 59, 999);
    now.setHours(0, 0, 0, 0);
    
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
};

const checkIsActive = (createdAt: any) => {
    if (!createdAt) return true;
    const createdDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdDate.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
};

const detectPlatform = (url: string): 'youtube' | 'tiktok' | 'instagram' | 'unknown' => {
    if (url.includes('youtube.com/shorts') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com/reel')) return 'instagram';
    return 'unknown';
};

const CircularProgress = ({ value, max, color, size = 150 }: { value: number, max: number, color: string, size?: number }) => {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const percent = Math.min(Math.max(value / max, 0), 1);
    const offset = circumference - percent * circumference;
    
    return (
      <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={size} height={size} viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="70" cy="70" r={radius} stroke="var(--border)" strokeWidth="10" fill="none" />
          <circle cx="70" cy="70" r={radius} stroke={color} strokeWidth="10" fill="none" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div style={{ position: 'absolute', textAlign: 'center', color: 'var(--text-main)' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{Math.round(percent * 100)}%</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>XP para upar</div>
        </div>
      </div>
    );
};

const CircularRemaining = ({ startStr, endStr, size = 130 }: { startStr: string, endStr: string, size?: number }) => {
  // 1. Processamento das Datas
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  const now = new Date();

  // Zerar horas para cálculo preciso de dias corridos
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  now.setHours(0, 0, 0, 0);

  const totalTime = Math.max(0, endDate.getTime() - startDate.getTime());
  const remainingTime = Math.max(0, endDate.getTime() - now.getTime());

  // 2. Cálculos Matemáticos
  // Evita divisão por zero com || 1
  const totalDays = Math.ceil(totalTime / (1000 * 60 * 60 * 24)) || 1; 
  const remainingDays = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));
  
  // Percentual para encher o círculo (Quanto mais tempo sobra, mais cheio)
  const percent = Math.min(Math.max(remainingDays / totalDays, 0), 1);

  // 3. Lógica de Cores (Semáforo)
  let color = '#ef4444'; // Vermelho (padrão/urgente <= 7)
  if (remainingDays > 14) {
      color = '#10b981'; // Verde (tranquilo)
  } else if (remainingDays > 7) {
      color = '#fbbf24'; // Amarelo (atenção)
  }

  // 4. Configuração do SVG
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - percent * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Círculo de Fundo (Cinza/Borda) */}
      <svg width={size} height={size} viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="70" cy="70" r={radius} stroke="var(--border)" strokeWidth="8" fill="none" opacity="0.5" />
        {/* Círculo de Progresso Colorido */}
        <circle 
          cx="70" cy="70" r={radius} 
          stroke={color} 
          strokeWidth="8" 
          fill="none" 
          strokeDasharray={circumference} 
          strokeDashoffset={offset} 
          strokeLinecap="round" 
          style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }} 
        />
      </svg>
      
      {/* Texto Central */}
      <div style={{ position: 'absolute', textAlign: 'center', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', lineHeight: 1.1 }}>
              {remainingDays}/{totalDays}
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: color, marginTop: 2 }}>
              dias restantes
          </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, subtext, icon: Icon, color }: any) => (
  <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: 'var(--shadow-card)' }}>
    <div style={{ width: '45px', height: '45px', borderRadius: '10px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}><Icon size={24} /></div>
    <div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>{value}</div>
        {subtext && <div style={{ fontSize: '0.75rem', color: color }}>{subtext}</div>}
    </div>
  </div>
);

type ViewType = 'overview' | 'campaigns' | 'campaign-details' | 'my-videos' | 'experience' | 'settings';

export default function ClipperDashboard() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewType>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userData, setUserData] = useState<UserData>({ name: '', pixKey: '', email: '', xp: 0, saldo: 0, joinedCampaigns: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  
  // Dados Reais
  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
  const [myVideos, setMyVideos] = useState<SubmittedVideo[]>([]);
  const [globalRanking, setGlobalRanking] = useState<GlobalRankingItem[]>([]);
  
  // Envio
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [submittingVideo, setSubmittingVideo] = useState(false);
  
  // Detalhes & Ranking da Campanha
  const [selectedCampaignForDetails, setSelectedCampaignForDetails] = useState<Campaign | null>(null);
  const [rankingList, setRankingList] = useState<RankingItem[]>([]);
  const [campaignEconomics, setCampaignEconomics] = useState({ weeklyPot: 0, totalViews: 0, myEarnings: 0 });

  // Controle de Pagamento
  const [payoutDue, setPayoutDue] = useState(false);
  const [nextPayoutDate, setNextPayoutDate] = useState<Date | null>(null);

  // Tema
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  // Gamificação
  const getCurrentRank = () => {
    const xp = userData.xp || 0;
    return RANKS.find(r => xp >= r.min && xp <= r.max) || RANKS[RANKS.length - 1];
  };
  const currentRank = getCurrentRank();
  const nextRank = RANKS[RANKS.findIndex(r => r.name === currentRank.name) + 1] || null;
  const progress = nextRank ? { current: (userData.xp || 0) - currentRank.min, total: nextRank.min - currentRank.min } : { current: 100, total: 100 };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    if (!auth.currentUser) return;
    try { await updateDoc(doc(db, "users", auth.currentUser.uid), { name: userData.name, pixKey: userData.pixKey }); alert("Salvo!"); } 
    catch (error) { console.error(error); alert("Erro."); } finally { setSaving(false); }
  };

  useEffect(() => {
    const fetchAllData = async () => {
      if (!auth.currentUser) return;
      
      try {
        // Busca Usuário
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          setUserData({ ...userDoc.data(), uid: userDoc.id } as UserData);
        }

        // Busca Campanhas Ativas
        const q = query(collection(db, "campaigns"), where("status", "==", "active"));
        const querySnapshot = await getDocs(q);
        const fetchedCampaigns: Campaign[] = [];
        querySnapshot.forEach((doc) => {
          fetchedCampaigns.push({ id: doc.id, ...doc.data() } as Campaign);
        });
        setAvailableCampaigns(fetchedCampaigns);

        // Busca Meus Vídeos
        const vQuery = query(collection(db, "videos"), where("userId", "==", auth.currentUser.uid));
        const vSnap = await getDocs(vQuery);
        const videosList = vSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubmittedVideo));
        videosList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setMyVideos(videosList);

        // Busca Ranking Global de XP (Top 10)
        const rankQuery = query(collection(db, "users"), orderBy("xp", "desc"), limit(10));
        const rankSnap = await getDocs(rankQuery);
        const globalRank: GlobalRankingItem[] = [];
        rankSnap.forEach(doc => {
            const d = doc.data();
            const xp = d.xp || 0;
            const rLevel = RANKS.find(r => xp >= r.min && xp <= r.max)?.name || 'Iniciante';
            globalRank.push({
                name: d.name,
                xp: xp,
                isMe: doc.id === auth.currentUser?.uid,
                rankLevel: rLevel
            });
        });
        setGlobalRanking(globalRank);

      } catch (error) { 
          console.error(error); 
      } finally { 
          setLoading(false); 
      }
    };

    fetchAllData();
    const savedTheme = localStorage.getItem('clipay-theme') as 'dark' | 'light' | null;
    if (savedTheme) { setTheme(savedTheme); document.documentElement.setAttribute('data-theme', savedTheme); }
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
      setUserData(prev => ({ ...prev, xp: prev.xp + 50, joinedCampaigns: [...(prev.joinedCampaigns || []), campaignId] }));
      alert("Sucesso! Você entrou na campanha.");
    } catch (error) { console.error(error); alert("Erro ao entrar."); }
  };

  // --- LÓGICA DE RANKING REAL & POTE ---
  const openCampaignDetails = async (campaign: Campaign) => {
      setLoading(true);
      setSelectedCampaignForDetails(campaign);
      
      try {
        // 1. Calcular o Pote Semanal (Orçamento / Dias * 7)
        const totalDays = getDaysDiff(campaign.startDate, campaign.endDate);
        const dailyBudget = campaign.budget / totalDays;
        let today = new Date();
        let weeklyPot = 0;
        
        const daysRemaining = getDaysDiff(today, campaign.endDate);

        if (daysRemaining < 7) {
            // Se faltam só 3 dias, o pote é: valor_diario * 3
            weeklyPot = dailyBudget * daysRemaining;
        } else {
            // Caso contrário, o pote é cheio (7 dias)
            weeklyPot = dailyBudget * 7;
        }

        // 2. Buscar TODOS os vídeos aprovados da campanha
        const vQuery = query(collection(db, "videos"), where("campaignId", "==", campaign.id), where("status", "==", "approved"));
        const vSnap = await getDocs(vQuery);

        // 3. Somar visualizações por usuário
        const userStatsMap = new Map<string, { views: number, count: number }>();
        let grandTotalViews = 0;

        vSnap.forEach(doc => {
            const data = doc.data();
            const uid = data.userId;
            const views = Number(data.views) || 0;
            
            grandTotalViews += views;

            if (!userStatsMap.has(uid)) {
                userStatsMap.set(uid, { views: 0, count: 0 });
            }
            const stats = userStatsMap.get(uid)!;
            stats.views += views;
            stats.count += 1;
        });

        // 4. Buscar nomes reais dos usuários e montar lista
        const rankingTemp: RankingItem[] = [];
        const userIds = Array.from(userStatsMap.keys());
        
        // Usamos Promise.all para buscar os nomes em paralelo e remover dados mockados
        await Promise.all(userIds.map(async (uid) => {
            let name = "Usuário Clipay";
            
            if (uid === auth.currentUser?.uid) {
                name = userData.name;
            } else {
                try {
                    const uDoc = await getDoc(doc(db, "users", uid));
                    if (uDoc.exists()) name = uDoc.data().name;
                } catch (e) {
                    console.error("Erro ao buscar nome", uid);
                }
            }

            const stats = userStatsMap.get(uid)!;
            // A porcentagem é calculada sobre o TOTAL de views da campanha
            const share = grandTotalViews > 0 ? (stats.views / grandTotalViews) : 0;
            const earnings = share * weeklyPot; // Quanto ele ganharia do pote semanal

            rankingTemp.push({
                userId: uid,
                name: name,
                avatar: name.charAt(0).toUpperCase(),
                totalViews: stats.views,
                videoCount: stats.count,
                isMe: uid === auth.currentUser?.uid,
                sharePercentage: share * 100, // Porcentagem (0-100)
                estimatedEarnings: earnings
            });
        }));

        // Ordenar do maior para o menor
        rankingTemp.sort((a, b) => b.totalViews - a.totalViews);
        setRankingList(rankingTemp);
        
        // Atualizar meus dados econômicos
        const myRank = rankingTemp.find(r => r.isMe);
        setCampaignEconomics({
            weeklyPot: weeklyPot,
            totalViews: grandTotalViews,
            myEarnings: myRank ? myRank.estimatedEarnings : 0
        });

        setView('campaign-details');
        window.scrollTo(0,0);

      } catch (error) { 
          console.error("Erro ao gerar ranking", error); 
          alert("Erro ao carregar detalhes.");
      } finally { 
          setLoading(false); 
      }
  };

  const handleSubmitVideo = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!auth.currentUser) return;
      const platform = detectPlatform(videoUrl);
      if (platform === 'unknown') { alert("Link inválido."); return; }
      
      const isDuplicate = myVideos.some(v => v.url === videoUrl);
      if (isDuplicate) { alert("Link já enviado."); return; }

      setSubmittingVideo(true);
      try {
          const campaign = availableCampaigns.find(c => c.id === selectedCampaignId);
          if (!campaign) throw new Error("Campanha não encontrada");

          const newVideo = {
            userId: auth.currentUser.uid, url: videoUrl, platform, views: 0, 
            campaignId: selectedCampaignId, campaignTitle: campaign.title,
            requiredHashtag: campaign.requiredHashtag, requiredMention: campaign.requiredMention,
            status: 'pending' as const, lastUpdated: serverTimestamp(), createdAt: serverTimestamp()
          };
          
          const docRef = await addDoc(collection(db, "videos"), newVideo);
          // @ts-ignore
          setMyVideos(prev => [{ id: docRef.id, ...newVideo, createdAt: new Date() }, ...prev]);
          
          const userRef = doc(db, "users", auth.currentUser.uid);
          await updateDoc(userRef, { xp: (userData.xp || 0) + 100 });
          setUserData(prev => ({ ...prev, xp: (prev.xp || 0) + 100 }));
          
          setVideoUrl(''); alert(`Vídeo enviado! +100 XP`);
      } catch (error) { console.error(error); alert("Erro ao enviar vídeo."); } finally { setSubmittingVideo(false); }
  };

  const changeView = (newView: ViewType) => { setView(newView); setIsMobileMenuOpen(false); };
  const myCampaignsList = availableCampaigns.filter(c => userData.joinedCampaigns?.includes(c.id));
  const availableList = availableCampaigns.filter(c => !userData.joinedCampaigns?.includes(c.id));

  if (loading) return <div style={{height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-dark)', color: 'var(--text-main)'}}>Carregando...</div>;

  return (
    <div className="dashboard-layout">
      <style>{`
        .campaign-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .campaign-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; transition: all 0.3s ease; display: flex; flex-direction: column; height: 100%; }
        .campaign-card:hover { border-color: var(--primary); transform: translateY(-3px); }
        .ranking-item { display: flex; align-items: center; padding: 15px; border-bottom: 1px solid var(--border); gap: 15px; }
        .ranking-pos { font-size: 1.2rem; font-weight: bold; min-width: 30px; }
        .video-status-badge { font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: 600; text-transform: uppercase; }
        .status-active { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .status-expired { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .theme-toggle-mini { width: 40px; height: 24px; background: var(--bg-card-hover); border-radius: 20px; position: relative; cursor: pointer; border: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 2px; }
        .theme-toggle-dot { width: 18px; height: 18px; background: var(--primary); border-radius: 50%; position: absolute; top: 2px; transition: left 0.3s; }
      `}</style>

      {/* SIDEBAR */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div style={{ padding: '25px 20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
          <Icons.Play fill="var(--primary)" size={28} /> Clipper
        </div>
        <nav className="sidebar-nav">
          <button onClick={() => changeView('overview')} className={`sidebar-btn ${view === 'overview' ? 'active' : ''}`}><Icons.BarChart3 size={20} /> Visão Geral</button>
          <button onClick={() => changeView('campaigns')} className={`sidebar-btn ${view === 'campaigns' || view === 'campaign-details' ? 'active' : ''}`}><Icons.Briefcase size={20} /> Campanhas</button>
          <button onClick={() => changeView('my-videos')} className={`sidebar-btn ${view === 'my-videos' ? 'active' : ''}`}><Icons.Play size={20} /> Meus Vídeos</button>
          <button onClick={() => changeView('experience')} className={`sidebar-btn ${view === 'experience' ? 'active' : ''}`}><Icons.Target size={20} /> Nível & XP</button>
          <button onClick={() => changeView('settings')} className={`sidebar-btn ${view === 'settings' ? 'active' : ''}`}><Icons.User size={20} /> Dados & Pix</button>
        </nav>
        <div className="sidebar-footer" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20}}>
          <button onClick={handleLogout} className="sidebar-btn" style={{ color: 'var(--danger)', width: 'auto' }}><Icons.LogOut size={20} /> Sair</button>
          
          <div onClick={toggleTheme} style={{ width: '60px', height: '32px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', borderRadius: '30px', position: 'relative', marginLeft: '10px' }}>
            <div className="theme-toggle-bg" style={{ position: 'absolute', left: '4px', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', transition: 'transform 0.3s ease', transform: theme === 'dark' ? 'translateX(28px)' : 'translateX(0)' }}></div>
            <div style={{ zIndex: 2, width: '24px', display: 'flex', justifyContent: 'center' }}><Icons.Sun size={14} color={theme === 'light' ? 'white' : 'var(--text-muted)'} /></div>
            <div style={{ zIndex: 2, width: '24px', display: 'flex', justifyContent: 'center' }}><Icons.Moon size={14} color={theme === 'dark' ? 'white' : 'var(--text-muted)'} /></div>
          </div>
        </div>
      </aside>

      <main className="main-content">
      <div className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', color: 'var(--primary)' }}>
          <Icons.Play fill="var(--primary)" size={24} /> Clipay
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} style={{ background: 'none', border: 'none', color: 'var(--text-main)' }}>
            {isMobileMenuOpen ? <Icons.X size={28} /> : <Icons.Menu size={28} />}
        </button>
      </div>

        {view === 'overview' && (
          <div className="fade-in-up">
            <h1 style={{marginBottom: 20}}>Olá, {userData.name}</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
              <StatCard label="Saldo Estimado" value={formatCurrency(userData.saldo)} icon={Icons.Wallet} color="var(--success)" />
              <StatCard label="Nível Atual" value={currentRank.name} icon={Icons.Target} color={currentRank.color} />
              <StatCard label="Meus Vídeos" value={myVideos.length} icon={Icons.Play} color="#8b5cf6" />
            </div>
            <div style={{marginTop: 30, padding: 15, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.3)', color: 'var(--primary)'}}>
                <div style={{fontWeight: 'bold', marginBottom: 5}}>Como eu ganho dinheiro? (Pote Semanal)</div>
                <div style={{fontSize: '0.9rem'}}>O pagamento não é mais fixo por view. Agora nós somamos todas as views da semana e calculamos qual porcentagem você contribuiu. Se você fez 10% das views totais, você leva 10% do Pote da Semana!</div>
            </div>
          </div>
        )}

        {view === 'campaigns' && (
          <div className="fade-in-up">
            <h2 style={{marginBottom: 20, display: 'flex', alignItems: 'center'}}><Icons.Play size={24} style={{marginRight: 8}} />Minhas Campanhas</h2>
            {myCampaignsList.length === 0 ? <p style={{color: 'var(--text-muted)'}}>Nenhuma. Veja as disponíveis abaixo.</p> : (
                <div className="campaign-grid">
                    {myCampaignsList.map(camp => (
                        <div key={camp.id} className="campaign-card" style={{cursor: 'pointer', borderColor: 'var(--primary)'}} onClick={() => openCampaignDetails(camp)}>
                            <h3>{camp.title}</h3>
                            <p style={{fontSize: '0.9rem', color: 'var(--text-muted)', margin: '10px 0'}}>{camp.description.substring(0, 80)}...</p>
                            <p style={{fontSize: '0.85rem', marginBottom: 15}}>Prazo: {formatDate(camp.startDate)} até {formatDate(camp.endDate)}</p>
                            <button className="btn btn-primary" style={{width: '100%', marginTop: 'auto'}}>Ver Ranking & Pote</button>
                        </div>
                    ))}
                </div>
            )}
            <h2 style={{marginTop: 40, marginBottom: 20, display: 'flex', alignItems: 'center'}}><Icons.Briefcase size={24} style={{marginRight: 10}} />Disponíveis</h2>
            <div className="campaign-grid">
                {availableList.map(camp => (
                    <div key={camp.id} className="campaign-card" style={{cursor: 'pointer', borderColor: 'var(--border)'}} onClick={() => openCampaignDetails(camp)}>
                        <h3>{camp.title}</h3>
                        <p style={{color: 'var(--success)', fontWeight: 'bold'}}>{formatCurrency(camp.budget)} Total</p>
                        <p style={{fontSize: '0.85rem', marginTop: 5}}>Prazo: {formatDate(camp.startDate)} até {formatDate(camp.endDate)}</p>
                        <button className="btn btn-outline" style={{marginTop: 15, width: '100%'}}>Ver Ranking e Pote</button>
                    </div>
                ))}
            </div>
          </div>
        )}

        {view === 'campaign-details' && selectedCampaignForDetails && (
            <div className="fade-in-up">
                <button 
                    onClick={() => setView('campaigns')} 
                    style={{background: 'none', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', marginBottom: '20px', fontSize: '0.9rem'}}
                >
                    <Icons.ArrowRight size={16} style={{transform: 'rotate(180deg)'}} /> Voltar para Campanhas
                </button>
                
                {/* --- HEADER DA CAMPANHA (COM CÍRCULO DINÂMICO E BOTÃO CONDICIONAL) --- */}
                  <div style={{background: 'var(--bg-card)', padding: 25, borderRadius: 12, border: '1px solid var(--border)', marginBottom: 30}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20}}>
                        
                        {/* Lado Esquerdo: Textos e Tags */}
                        <div style={{flex: 1, minWidth: '250px'}}>
                            <h1 style={{fontSize: '1.8rem', marginBottom: 10}}>{selectedCampaignForDetails.title}</h1>
                            <p style={{color: 'var(--text-muted)', marginBottom: 15}}>{selectedCampaignForDetails.description}</p>
                            
                            <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20}}>
                                <span style={{background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', padding: '5px 10px', borderRadius: 6, fontWeight: 'bold', fontSize: '0.9rem'}}>
                                    #{selectedCampaignForDetails.requiredHashtag}
                                </span>
                                <span style={{background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', padding: '5px 10px', borderRadius: 6, fontWeight: 'bold', fontSize: '0.9rem'}}>
                                    @{selectedCampaignForDetails.requiredMention}
                                </span>
                            </div>

                            {/* LÓGICA DO BOTÃO: PARTICIPAR vs ENVIAR */}
                            {userData.joinedCampaigns?.includes(selectedCampaignForDetails.id) ? (
                                <button className="btn btn-primary" onClick={() => { setSelectedCampaignId(selectedCampaignForDetails.id); setView('my-videos'); }}>
                                    <Icons.Play size={20} style={{marginRight: 8}} />
                                    Enviar Vídeo para essa Campanha
                                </button>
                            ) : (
                                <button className="btn btn-primary" onClick={(e) => handleJoinCampaign(selectedCampaignForDetails.id, e)} style={{background: 'var(--success)', border: 'none'}}>
                                    <Icons.Briefcase size={20} style={{marginRight: 8}} />
                                    Participar da Campanha
                                </button>
                            )}
                        </div>

                        {/* Lado Direito: Componente Circular Dinâmico */}
                        <div>
                            <CircularRemaining 
                                startStr={selectedCampaignForDetails.startDate} 
                                endStr={selectedCampaignForDetails.endDate} 
                                size={140}
                            />
                        </div>
                    </div>
                </div>
                {/* ESTATÍSTICAS DO POTE */}
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 40}}>
                   <StatCard label="Pote Semanal" value={formatCurrency(campaignEconomics.weeklyPot)} subtext="Valor distribuído esta semana" icon={Icons.Wallet} color="var(--success)" />
                   <StatCard label="Total Views (Todos)" value={campaignEconomics.totalViews.toLocaleString()} icon={Icons.BarChart3} color="var(--primary)" />
                   <StatCard label="Sua Fatura Estimada" value={formatCurrency(campaignEconomics.myEarnings)} subtext="Baseado na sua % atual" icon={Icons.Target} color="#fbbf24" />
                </div>
                {/* RANKING REAL */}
                <div style={{background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)'}}>
                    <div style={{padding: 20, borderBottom: '1px solid var(--border)', fontWeight: 'bold'}}>Ranking Semanal</div>
                    {rankingList.length === 0 ? <div style={{padding: 30, textAlign: 'center', color: 'var(--text-muted)'}}>Nenhum vídeo aprovado ainda.</div> :
                     rankingList.map((user, index) => (
                        <div key={user.userId} className="ranking-item" style={user.isMe ? {background: 'rgba(59, 130, 246, 0.05)'} : {}}>
                            <div className="ranking-pos" style={{color: index < 3 ? '#fbbf24' : 'var(--text-muted)'}}>{index + 1}º</div>
                            <div style={{flex: 1}}>
                                <div style={{fontWeight: user.isMe ? 'bold' : 'normal'}}>{user.name} {user.isMe && '(Você)'}</div>
                                <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{user.videoCount} vídeos enviados</div>
                            </div>
                            <div style={{textAlign: 'right'}}>
                                <div style={{fontWeight: 'bold'}}>{user.totalViews.toLocaleString()} views</div>
                                <div style={{fontSize: '0.85rem', color: 'var(--success)', fontWeight: 'bold'}}>{user.sharePercentage.toFixed(2)}% do Pote</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {view === 'my-videos' && (
          <div className="fade-in-up">
            <h1 style={{marginBottom: 20}}>Meus Vídeos</h1>
            <div style={{background: 'var(--bg-card)', padding: 25, borderRadius: 12, border: '1px solid var(--border)', marginBottom: 40}}>
                <form onSubmit={handleSubmitVideo}>
                    <label style={{display: 'block', marginBottom: 10}}>Campanha</label>
                    <select style={{width: '100%', padding: 12, marginBottom: 20, borderRadius: 8, background: 'var(--bg-dark)', color: 'var(--text-main)', border: '1px solid var(--border)'}} value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)} required>
                        <option value="">Selecione...</option>
                        {myCampaignsList.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    <label style={{display: 'block', marginBottom: 10}}>Link</label>
                    <input type="url" style={{width: '100%', padding: 12, marginBottom: 20, borderRadius: 8, background: 'var(--bg-dark)', color: 'var(--text-main)', border: '1px solid var(--border)'}} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} required />
                    <button type="submit" className="btn btn-primary" style={{width: '100%'}} disabled={submittingVideo}>{submittingVideo ? 'Enviando...' : 'Registrar'}</button>
                </form>
            </div>
            {myVideos.map(video => (
                <div key={video.id} style={{background: 'var(--bg-card)', padding: 15, borderRadius: 8, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                    <div>
                        <div style={{fontWeight: 'bold'}}>{video.campaignTitle}</div>
                        <a href={video.url} target="_blank" rel="noreferrer" style={{fontSize: '0.85rem', color: 'var(--primary)'}}>Abrir Vídeo</a>
                    </div>
                    <div style={{textAlign: 'right'}}>
                        <div style={{fontWeight: 'bold'}}>{video.views.toLocaleString()} views</div>
                        <span className={`video-status-badge ${checkIsActive(video.createdAt) ? 'status-active' : 'status-expired'}`}>{checkIsActive(video.createdAt) ? 'Ativo' : 'Expirado'}</span>
                    </div>
                </div>
            ))}
          </div>
        )}

        {view === 'experience' && (
          <div className="fade-in-up">
            <h1 style={{marginBottom: 30}}>Nível & Rankings</h1>
            
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 30, marginBottom: 50}}>
                <div style={{background: 'var(--bg-card)', padding: 30, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                    <h2 style={{marginBottom: 20, color: currentRank.color}}>Elo {currentRank.name}</h2>
                    <CircularProgress value={progress.current} max={progress.total} color={currentRank.color} />
                    <div style={{marginTop: 20, fontWeight: 'bold'}}>{userData.xp} XP Total</div>
                </div>
                <div>
                    <h3 style={{marginBottom: 20}}>Como ganhar XP?</h3>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 15}}>
                        {XP_RULES.map((rule, i) => (
                            <div key={i} style={{display: 'flex', alignItems: 'center', gap: 15, background: 'var(--bg-card)', padding: 15, borderRadius: 12, border: '1px solid var(--border)'}}>
                                <div style={{background: 'var(--bg-card-hover)', padding: 10, borderRadius: 8, color: 'var(--primary)'}}><rule.icon size={20} /></div>
                                <div style={{flex: 1, fontWeight: '500'}}>{rule.action}</div>
                                <div style={{fontWeight: 'bold', color: 'var(--success)'}}>+{rule.xp} XP</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <h2 style={{marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10}}><Icons.Globe size={24} /> Ranking Global (Top 10 XP)</h2>
            <div style={{background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 50, overflow: 'hidden'}}>
                {globalRanking.length === 0 ? <div style={{padding: 20}}>Carregando ranking...</div> : 
                 globalRanking.map((user, index) => (
                    <div key={index} className="ranking-item" style={user.isMe ? {background: 'rgba(59, 130, 246, 0.1)', borderColor: 'var(--primary)'} : {}}>
                        <div className="ranking-pos" style={{color: index < 3 ? '#fbbf24' : 'var(--text-muted)'}}>{index + 1}º</div>
                        <div style={{flex: 1, fontWeight: user.isMe ? 'bold' : 'normal'}}>{user.name} {user.isMe && '(Você)'}</div>
                        <div style={{marginRight: 20, fontSize: '0.85rem', padding: '2px 8px', borderRadius: 4, background: 'var(--bg-card-hover)'}}>{user.rankLevel}</div>
                        <div style={{fontWeight: 'bold', color: 'var(--primary)'}}>{user.xp} XP</div>
                    </div>
                 ))
                }
            </div>

            <h2 style={{marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10}}><Icons.Trophy size={24} /> Campanhas que participo</h2>
            <div style={{display: 'grid', gap: 15}}>
                {myCampaignsList.length === 0 ? <p style={{color: 'var(--text-muted)'}}>Você não está em nenhuma campanha.</p> :
                 myCampaignsList.map(camp => (
                    <div key={camp.id} style={{background: 'var(--bg-card)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer'}} onClick={() => openCampaignDetails(camp)}>
                        <div style={{fontWeight: 'bold'}}>{camp.title}</div>
                        <div style={{color: 'var(--primary)', fontSize: '0.9rem'}}>Ver minha posição →</div>
                    </div>
                 ))
                }
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