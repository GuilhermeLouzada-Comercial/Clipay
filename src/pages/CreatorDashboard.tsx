import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// --- TIPOS ---
interface Campaign {
  id: string;
  title: string;
  budget: number;
  description: string;
  requiredHashtag: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'pending_payment' | 'rejected' | 'finished';
  creatorId: string;
  createdAt: any;
}

interface DashboardStats {
  totalInvestment: number;
  activeCampaigns: number;
  totalViews: number;
  totalVideos: number;
  activeClippers: number;
}

interface NewCampaignState {
  title: string;
  budget: string;
  description: string;
  hashtag: string;
  mention: string;
  startDate: string;
  endDate: string;
}

interface RankingItem {
    userId: string;
    name: string;
    totalViews: number;
    videoCount: number;
    sharePercentage: number;
    estimatedEarnings: number;
}

interface DashInputProps {
  label: string;
  type?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  prefix?: string;
  className?: string;
  style?: React.CSSProperties; 
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtext?: string;
}

// --- FUNÇÕES AUXILIARES ---
const formatCurrency = (value: number | string) => {
  const numberValue = Number(value);
  if (isNaN(numberValue)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numberValue);
};

const formatMoneyInput = (value: string) => {
  const cleanValue = value.replace(/\D/g, "");
  const options = { minimumFractionDigits: 2 };
  const result = new Intl.NumberFormat("pt-BR", options).format(parseFloat(cleanValue) / 100);
  return cleanValue ? result : "";
};

const parseMoneyToFloat = (value: string) => {
    if (!value) return 0;
    const clean = value.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean);
};

// Ajustado para aceitar string ou Date
const getDaysDiff = (startInput: string | Date, endInput: string | Date) => {
    const start = new Date(startInput);
    const end = new Date(endInput);
    const diff = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diff / (1000 * 3600 * 24)) || 1;
};

// Componente interno de Input
const DashInput: React.FC<DashInputProps> = ({ label, type = "text", value, onChange, placeholder, prefix, className, style }) => (
  <div style={{ marginBottom: '15px' }}>
    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 12px', transition: 'border 0.3s' }}>
      {prefix && <span style={{ color: 'var(--text-muted)', marginRight: '8px', fontWeight: 'bold' }}>{prefix}</span>}
      <input 
        type={type} 
        value={value} 
        onChange={onChange} 
        placeholder={placeholder}
        className={className}
        style={{ 
            background: 'transparent', 
            border: 'none', 
            color: 'var(--text-main)', 
            width: '100%', 
            padding: '12px 0', 
            outline: 'none',
            fontSize: '1rem',
            fontFamily: 'inherit',
            ...style 
        }}
      />
    </div>
  </div>
);

const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, color, subtext }) => (
  <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: 'var(--shadow-card)' }}>
    <div style={{ width: '45px', height: '45px', borderRadius: '10px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}>
      <Icon size={24} />
    </div>
    <div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>{value}</div>
      {subtext && <div style={{ fontSize: '0.75rem', color: color }}>{subtext}</div>}
    </div>
  </div>
);

export default function CreatorDashboard() {
  const navigate = useNavigate();
  const [view, setView] = useState<'dashboard' | 'new-campaign' | 'campaign-details'>('dashboard');
  const [userName, setUserName] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  // Estados Gerais
  const [stats, setStats] = useState<DashboardStats>({
    totalInvestment: 0, activeCampaigns: 0, totalViews: 0, totalVideos: 0, activeClippers: 0
  });

  // Estado Detalhes da Campanha
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignRanking, setCampaignRanking] = useState<RankingItem[]>([]);
  const [campaignDetailStats, setCampaignDetailStats] = useState({
      totalViews: 0,
      weeklyPot: 0,
      clipersCount: 0
  });

  // Estado do formulário
  const [newCampaign, setNewCampaign] = useState<NewCampaignState>({
    title: '', budget: '', description: '', hashtag: '', mention: '', startDate: '', endDate: ''
  });

  useEffect(() => {
    const fetchAllData = async () => {
      if (auth.currentUser) {
        setUserName(auth.currentUser.displayName || 'Criador');
        const q = query(collection(db, "campaigns"), where("creatorId", "==", auth.currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        const userCampaigns: Campaign[] = [];
        let investment = 0; let activeCount = 0;
        const campaignIds: string[] = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            userCampaigns.push({ id: doc.id, ...data } as Campaign);
            campaignIds.push(doc.id);
            investment += Number(data.budget) || 0;
            if (data.status === 'active') activeCount++;
        });

        let views = 0; let videosCount = 0; const clipperSet = new Set<string>();

        if (campaignIds.length > 0) {
            const vSnap = await getDocs(collection(db, "videos"));
            vSnap.forEach(doc => {
                const vData = doc.data();
                if (campaignIds.includes(vData.campaignId)) {
                    views += Number(vData.views) || 0;
                    videosCount++;
                    clipperSet.add(vData.userId);
                }
            });
        }

        setStats({
            totalInvestment: investment, activeCampaigns: activeCount, totalViews: views, totalVideos: videosCount, activeClippers: clipperSet.size
        });
        setCampaigns(userCampaigns);
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

  const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const formatted = formatMoneyInput(e.target.value);
      setNewCampaign({ ...newCampaign, budget: formatted });
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      const budgetVal = parseMoneyToFloat(newCampaign.budget);
      const cleanHashtag = newCampaign.hashtag.replace('#', '').trim();
      const cleanMention = newCampaign.mention.replace('@', '').trim();

      const docRef = await addDoc(collection(db, "campaigns"), {
        creatorId: auth.currentUser.uid,
        title: newCampaign.title,
        budget: budgetVal,
        description: newCampaign.description,
        requiredHashtag: cleanHashtag,
        requiredMention: cleanMention, 
        startDate: newCampaign.startDate,
        endDate: newCampaign.endDate,
        status: 'pending_payment', 
        createdAt: serverTimestamp()
      });

      const message = `Olá! Criei a campanha "${newCampaign.title}" (ID: ${docRef.id}).\n\nOrçamento: ${formatCurrency(budgetVal)}\nPrazo: ${newCampaign.startDate} até ${newCampaign.endDate}\n\nAguardo instruções para o PIX.`;
      const whatsappUrl = `https://wa.me/553133601286?text=${encodeURIComponent(message)}`;

      window.open(whatsappUrl, '_blank');
      setView('dashboard');
      setNewCampaign({ title: '', budget: '', description: '', hashtag: '', mention: '', startDate: '', endDate: '' });
      alert("Campanha criada! Finalize o pagamento no WhatsApp para ativar.");

    } catch (error) {
      console.error("Erro ao criar campanha:", error);
      alert("Erro ao criar campanha. Tente novamente.");
    }
  };

  // --- LÓGICA DETALHES DA CAMPANHA (ATUALIZADA) ---
  const openCampaignDetails = async (campaign: Campaign) => {
      setLoading(true);
      setSelectedCampaign(campaign);
      
      try {
          // 1. Calcular Pote Semanal (Lógica de dias restantes)
          const totalDays = getDaysDiff(campaign.startDate, campaign.endDate);
          const dailyBudget = campaign.budget / totalDays;
          
          const today = new Date();
          const daysRemaining = getDaysDiff(today, campaign.endDate);
          
          let weeklyPot = 0;
          if (daysRemaining < 7 && daysRemaining > 0) {
              // Se faltam menos de 7 dias, o pote é proporcional
              weeklyPot = dailyBudget * daysRemaining;
          } else {
              // Padrão: 7 dias
              weeklyPot = dailyBudget * 7;
          }

          // 2. Buscar Vídeos da Campanha
          const q = query(collection(db, "videos"), where("campaignId", "==", campaign.id));
          const querySnapshot = await getDocs(q);

          let totalViews = 0;
          const userMap = new Map<string, { views: number, count: number }>();

          querySnapshot.forEach((doc) => {
              const data = doc.data();
              const views = Number(data.views) || 0;
              // Somente conta views de vídeos aprovados para o ranking, mas podemos mostrar totais
              if (data.status === 'approved') {
                  totalViews += views;
                  if (!userMap.has(data.userId)) userMap.set(data.userId, { views: 0, count: 0 });
                  const u = userMap.get(data.userId)!;
                  u.views += views;
                  u.count += 1;
              }
          });

          // 3. Montar Ranking
          const ranking: RankingItem[] = [];
          const userIds = Array.from(userMap.keys());

          await Promise.all(userIds.map(async (uid) => {
              let name = "Clipador";
              try {
                  const uDoc = await getDoc(doc(db, "users", uid));
                  if (uDoc.exists()) name = uDoc.data().name;
              } catch (e) {}

              const stats = userMap.get(uid)!;
              const share = totalViews > 0 ? (stats.views / totalViews) : 0;
              
              ranking.push({
                  userId: uid,
                  name: name,
                  totalViews: stats.views,
                  videoCount: stats.count,
                  sharePercentage: share * 100,
                  estimatedEarnings: share * weeklyPot
              });
          }));

          ranking.sort((a, b) => b.totalViews - a.totalViews);

          setCampaignRanking(ranking);
          setCampaignDetailStats({
              totalViews,
              weeklyPot,
              clipersCount: userIds.length
          });

          setView('campaign-details');
          window.scrollTo(0, 0);

      } catch (error) {
          console.error(error);
          alert("Erro ao carregar detalhes.");
      } finally {
          setLoading(false);
      }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', color: 'var(--text-main)', paddingBottom: '40px', transition: 'background 0.3s' }}>
      
      {/* CSS para forçar o ícone do calendário a ficar branco no modo escuro */}
      <style>{`
        input[type="date"] { cursor: pointer; }
        [data-theme="dark"] input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1); cursor: pointer; }
        .ranking-table { width: 100%; border-collapse: collapse; }
        .ranking-table th { text-align: left; padding: 15px; color: var(--text-muted); border-bottom: 1px solid var(--border); font-size: 0.9rem; }
        .ranking-table td { padding: 15px; border-bottom: 1px solid var(--border); }
        .ranking-row:hover { background: var(--bg-card-hover); }
      `}</style>

      {/* Header */}
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            <Icons.Play fill="url(#gradient)" size={24} />
            Clipay Creator
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div onClick={toggleTheme} style={{ width: '60px', height: '32px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', borderRadius: '30px', position: 'relative' }}>
                <div className="theme-toggle-bg" style={{ position: 'absolute', left: '4px', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', transition: 'transform 0.3s ease', transform: theme === 'dark' ? 'translateX(28px)' : 'translateX(0)' }}></div>
                <div style={{ zIndex: 2, width: '24px', display: 'flex', justifyContent: 'center' }}><Icons.Sun size={14} color={theme === 'light' ? 'white' : 'var(--text-muted)'} /></div>
                <div style={{ zIndex: 2, width: '24px', display: 'flex', justifyContent: 'center' }}><Icons.Moon size={14} color={theme === 'dark' ? 'white' : 'var(--text-muted)'} /></div>
            </div>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Olá, {userName}</span>
            <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}><Icons.LogOut size={18} /> Sair</button>
          </div>
        </div>
      </header>

      <div className="container" style={{ marginTop: '40px', padding: '0 20px' }}>
        
        {/* NAVEGAÇÃO DE TOPO (Só aparece se não estiver em detalhes) */}
        {view !== 'campaign-details' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
            <div>
                <h1 style={{ fontSize: '1.8rem', marginBottom: '5px' }}>{view === 'dashboard' ? 'Visão Geral' : 'Nova Campanha'}</h1>
                <p style={{ color: 'var(--text-muted)' }}>{view === 'dashboard' ? 'Acompanhe o desempenho dos seus vídeos.' : 'Preencha os dados para lançar seu desafio.'}</p>
            </div>
            {view === 'dashboard' && <button onClick={() => setView('new-campaign')} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}><Icons.Plus size={20} /> Nova Campanha</button>}
            {view === 'new-campaign' && <button onClick={() => setView('dashboard')} className="btn btn-outline" style={{ padding: '10px 20px' }}>Cancelar</button>}
            </div>
        )}

        {/* --- VIEW: DASHBOARD --- */}
        {view === 'dashboard' && (
          <>
            <div className='hide-desktop' style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
              <StatCard label="Investimento Total" value={formatCurrency(stats.totalInvestment)} icon={Icons.Wallet} color="#3b82f6" />
              <StatCard label="Campanhas Ativas" value={stats.activeCampaigns} icon={Icons.Trophy} color="#fbbf24" />
              <StatCard label="Views Totais" value={stats.totalViews.toLocaleString()} icon={Icons.BarChart3} color="#10b981" />
              <StatCard label="Vídeos Postados" value={stats.totalVideos} icon={Icons.Play} color="#8b5cf6" />
              <StatCard label="Clipadores Ativos" value={stats.activeClippers} icon={Icons.User} color="#ef4444" />
            </div>
            <div className='hide-mobile' style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
              <StatCard label="Investimento Total" value={formatCurrency(stats.totalInvestment)} icon={Icons.Wallet} color="#3b82f6" />
              <StatCard label="Campanhas Ativas" value={stats.activeCampaigns} icon={Icons.Trophy} color="#fbbf24" />
            </div>
            <div className='hide-mobile' style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}> 
              <StatCard label="Views Totais" value={stats.totalViews.toLocaleString()} icon={Icons.BarChart3} color="#10b981" />
              <StatCard label="Vídeos Postados" value={stats.totalVideos} icon={Icons.Play} color="#8b5cf6" />
              <StatCard label="Clipadores Ativos" value={stats.activeClippers} icon={Icons.User} color="#ef4444" />
            </div>

            <h2 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>Minhas Campanhas</h2>
            {loading ? <p style={{ color: 'var(--text-muted)' }}>Carregando...</p> : campaigns.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
                <Icons.Trophy size={40} style={{ color: '#3b82f6', marginBottom: '15px', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1.2rem', marginBottom: '10px' }}>Nenhuma campanha encontrada</h3>
                <button onClick={() => setView('new-campaign')} className="btn btn-outline">Criar Agora</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '15px' }}>
                {campaigns.map((camp) => (
                  <div key={camp.id} style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', transition: 'all 0.3s', cursor: 'pointer' }} onClick={() => openCampaignDetails(camp)}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '5px', color: 'var(--text-main)' }}>{camp.title}</h3>
                      <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', color: 'var(--text-muted)', alignItems: 'center' }}>
                        <span>Orçamento: <strong style={{ color: '#10b981' }}>{formatCurrency(camp.budget)}</strong></span>
                        {camp.endDate && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Icons.Clock size={14} /> Até {new Date(camp.endDate).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ 
                            padding: '5px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600',
                            background: camp.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                            color: camp.status === 'active' ? '#10b981' : '#fbbf24'
                        }}>
                            {camp.status === 'active' ? 'Ativa' : 'Pendente'}
                        </div>
                        <Icons.ArrowRight size={18} color="var(--text-muted)" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* --- VIEW: CAMPAIGN DETAILS --- */}
        {view === 'campaign-details' && selectedCampaign && (
            <div className="fade-in-up">
                <button onClick={() => setView('dashboard')} style={{background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 5}}>
                    <Icons.ArrowRight size={16} style={{transform: 'rotate(180deg)'}} /> Voltar para o Painel
                </button>

                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30}}>
                    <div>
                        <h1 style={{fontSize: '1.8rem', marginBottom: 5}}>{selectedCampaign.title}</h1>
                        <p style={{color: 'var(--text-muted)'}}>Status: <span style={{color: '#10b981', fontWeight: 'bold'}}>{selectedCampaign.status.toUpperCase()}</span> • Hashtag: #{selectedCampaign.requiredHashtag}</p>
                    </div>
                    <div style={{textAlign: 'right'}}>
                        <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>Orçamento Total</div>
                        <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981'}}>{formatCurrency(selectedCampaign.budget)}</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
                    <StatCard label="Total Views Aprovadas" value={campaignDetailStats.totalViews.toLocaleString()} icon={Icons.BarChart3} color="#3b82f6" />
                    <StatCard label="Clipadores Ativos" value={campaignDetailStats.clipersCount} icon={Icons.User} color="#8b5cf6" />
                    <StatCard label="Pote Semanal Atual" value={formatCurrency(campaignDetailStats.weeklyPot)} subtext="Valor sendo distribuído" icon={Icons.Wallet} color="#fbbf24" />
                </div>

                <h2 style={{fontSize: '1.4rem', marginBottom: 20}}>Ranking de Performance</h2>
                <div style={{background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden'}}>
                    <table className="ranking-table">
                        <thead>
                            <tr>
                                <th>Posição</th>
                                <th>Clipador</th>
                                <th>Vídeos Aprovados</th>
                                <th>Total Views</th>
                                <th>% do Pote</th>
                                <th>Ganho Estimado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {campaignRanking.length === 0 ? <tr><td colSpan={6} style={{textAlign: 'center', color: 'var(--text-muted)'}}>Nenhum dado ainda.</td></tr> :
                             campaignRanking.map((item, index) => (
                                <tr key={item.userId} className="ranking-row">
                                    <td><strong>{index + 1}º</strong></td>
                                    <td>{item.name}</td>
                                    <td>{item.videoCount}</td>
                                    <td style={{fontWeight: 'bold'}}>{item.totalViews.toLocaleString()}</td>
                                    <td style={{color: '#10b981'}}>{item.sharePercentage.toFixed(2)}%</td>
                                    <td style={{color: '#fbbf24', fontWeight: 'bold'}}>{formatCurrency(item.estimatedEarnings)}</td>
                                </tr>
                             ))
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* --- VIEW: NEW CAMPAIGN --- */}
        {view === 'new-campaign' && (
          <div style={{ maxWidth: '600px', margin: '0 auto', background: 'var(--bg-card)', padding: '30px', borderRadius: '16px', border: '1px solid var(--border)' }}>
            <form onSubmit={handleCreateCampaign}>
              <DashInput label="Título da Campanha" placeholder="Ex: Desafio Copa do Mundo" value={newCampaign.title} onChange={(e) => setNewCampaign({...newCampaign, title: e.target.value})} />
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                <DashInput 
                    label="Orçamento Total (Pote)" 
                    type="text" 
                    placeholder="0,00" 
                    prefix="R$" 
                    value={newCampaign.budget} 
                    onChange={handleBudgetChange} 
                />
              </div>

              {/* DATAS COM ESTILO MODERNO */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <DashInput 
                    className="date-input-modern"
                    label="Início da Campanha" 
                    type="date" 
                    style={{ colorScheme: theme === 'dark' ? 'dark' : 'light' }}
                    value={newCampaign.startDate} 
                    onChange={(e) => setNewCampaign({...newCampaign, startDate: e.target.value})} 
                />
                <DashInput 
                    className="date-input-modern"
                    label="Fim da Campanha" 
                    type="date" 
                    style={{ colorScheme: theme === 'dark' ? 'dark' : 'light' }}
                    value={newCampaign.endDate} 
                    onChange={(e) => setNewCampaign({...newCampaign, endDate: e.target.value})} 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <DashInput label="Hashtag Obrigatória" placeholder="Ex: ClipayOficial" prefix="#" value={newCampaign.hashtag} onChange={(e) => setNewCampaign({...newCampaign, hashtag: e.target.value.replace(/#/g, '').replace(/\s/g, '')})} />
                <DashInput label="Conta para Marcar (@)" placeholder="Ex: podpah" prefix="@" value={newCampaign.mention} onChange={(e) => setNewCampaign({...newCampaign, mention: e.target.value.replace(/@/g, '').replace(/\s/g, '')})} />
              </div>
              
              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Regras e Descrição</label>
                <textarea rows={4} value={newCampaign.description} onChange={(e) => setNewCampaign({...newCampaign, description: e.target.value})} placeholder="Descreva o que você espera dos clipadores..." style={{ width: '100%', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-main)', outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
              </div>

              <button type="submit" className="btn btn-primary btn-block" style={{ width: '100%', padding: '15px', fontSize: '1rem' }}>Criar e Pagar via WhatsApp</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}