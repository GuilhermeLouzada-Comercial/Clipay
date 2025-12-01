import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  query, 
  where, 
  writeBatch, 
  increment, 
  serverTimestamp,
  Timestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// --- INTERFACES ---
interface CampaignData {
  id: string;
  title: string;
  budget: number;
  description: string;
  requiredHashtag: string;
  status: string;
  creatorId?: string;
  startDate: string;
  endDate: string;
  nextPayout?: any;
  createdAt?: any;
}

interface UserData {
    id: string;
    name: string;
    email: string;
    role: string;
    saldo: number;
    pixKey?: string;
    xp: number;
}

interface TransactionData {
    id: string;
    userId: string;
    amount: number;
    type: string;
    campaignId?: string;
    createdAt: any;
}

interface DashboardStats {
  totalRevenue: number;
  nextPayments: number;
  totalViews: number;
  totalVideos: number;
  activeClippers: number;
  activeCreators: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType;
  color: string;
}

// --- HELPER FUNCTIONS ---
const getNextMonday = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = (day === 1) ? 0 : (7 - day + 1) % 7; 
    const nextMon = new Date(d.setDate(d.getDate() + (diff === 0 ? 0 : diff))); 
    nextMon.setHours(0, 0, 0, 0);
    if (nextMon < new Date()) nextMon.setDate(nextMon.getDate() + 7);
    return nextMon;
};

const getCountdown = (targetDate: Date) => {
    const now = new Date();
    const diff = targetDate.getTime() - now.getTime();
    if (diff <= 0) return "Processamento Pendente";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h`;
};

const getDaysDiff = (startInput: string | Date, endInput: string | Date) => {
    const start = new Date(startInput);
    const end = new Date(endInput);
    const diff = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diff / (1000 * 3600 * 24)) || 1;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (date: any) => {
    if (!date) return '-';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
};

// Componente de Card
const StatCard: React.FC<StatCardProps> = ({ label, value, subtext, icon: Icon, color }) => (
  <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: 'var(--shadow-card)' }}>
    <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}>
      <Icon size={24} />
    </div>
    <div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-main)' }}>{value}</div>
      {subtext && <div style={{ fontSize: '0.75rem', color: color, marginTop: '2px' }}>{subtext}</div>}
    </div>
  </div>
);

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [tab, setTab] = useState<'overview' | 'users' | 'transactions'>('overview');
  
  // Dados Gerais
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0, nextPayments: 0, totalViews: 0, totalVideos: 0, activeClippers: 0, activeCreators: 0
  });
  const [pendingCampaigns, setPendingCampaigns] = useState<CampaignData[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<CampaignData[]>([]);
  
  // Dados de Listas
  const [usersList, setUsersList] = useState<UserData[]>([]);
  const [transactionsList, setTransactionsList] = useState<TransactionData[]>([]);

  // Tema & Timer
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [, setTick] = useState(0);

  useEffect(() => {
    fetchData();
    const savedTheme = localStorage.getItem('clipay-theme') as 'dark' | 'light' | null;
    if (savedTheme) { setTheme(savedTheme); document.documentElement.setAttribute('data-theme', savedTheme); }
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('clipay-theme', newTheme);
  };

  const fetchData = async () => {
    try {
      // 1. Users
      const usersSnap = await getDocs(collection(db, "users"));
      let clippers = 0; let creators = 0;
      const usersTemp: UserData[] = [];
      
      usersSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.role === 'clipper') clippers++;
        if (data.role === 'creator') creators++;
        usersTemp.push({ id: docSnap.id, ...data } as UserData);
      });
      setUsersList(usersTemp);

      // 2. Campaigns
      const campaignsSnap = await getDocs(collection(db, "campaigns"));
      let revenue = 0;
      const pending: CampaignData[] = [];
      const active: CampaignData[] = [];
      
      campaignsSnap.forEach(docSnap => {
        const data = docSnap.data() as Omit<CampaignData, 'id'>;
        if (data.status !== 'rejected') revenue += Number(data.budget) || 0;
        if (data.status === 'pending_payment' || data.status === 'pending_approval') {
          pending.push({ id: docSnap.id, ...data });
        } else if (data.status === 'active') {
          active.push({ id: docSnap.id, ...data });
        }
      });

      // 3. Videos (Total Views Real)
      const videosSnap = await getDocs(collection(db, "videos"));
      let totalVids = 0;
      let totalViewsReal = 0;
      videosSnap.forEach(doc => {
          totalVids++;
          totalViewsReal += Number(doc.data().views) || 0;
      });

      setStats({
        totalRevenue: revenue, nextPayments: 0,
        totalViews: totalViewsReal, totalVideos: totalVids,
        activeClippers: clippers, activeCreators: creators
      });

      setPendingCampaigns(pending);
      setActiveCampaigns(active);
      setLoading(false);

    } catch (error) { console.error("Erro fetch admin:", error); setLoading(false); }
  };

  // Carrega transações apenas quando clica na aba (Otimização)
  const fetchTransactions = async () => {
      setLoading(true);
      try {
          // Pega as últimas 50 transações
          const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"), limit(50));
          const snap = await getDocs(q);
          const trans: TransactionData[] = [];
          snap.forEach(doc => trans.push({ id: doc.id, ...doc.data() } as TransactionData));
          setTransactionsList(trans);
      } catch (e) { console.error(e); }
      setLoading(false);
  };

  const handleApproveCampaign = async (campaignId: string, currentTitle: string) => {
    if(!window.confirm(`Confirmar o recebimento do PIX para "${currentTitle}"?`)) return;
    try {
      const campaignRef = doc(db, "campaigns", campaignId);
      await updateDoc(campaignRef, {
        status: 'active', approvedAt: new Date(), nextPayout: Timestamp.fromDate(getNextMonday())
      });
      alert("Campanha ativada!");
      fetchData();
    } catch (error) { alert("Erro ao aprovar."); }
  };

  const handleManualPayout = async (camp: CampaignData) => {
    const totalDays = getDaysDiff(camp.startDate, camp.endDate);
    const dailyBudget = camp.budget / totalDays;
    const daysRemaining = getDaysDiff(new Date(), camp.endDate);
    const weeklyPot = (daysRemaining < 7 && daysRemaining > 0) ? (dailyBudget * daysRemaining) : (dailyBudget * 7);

    if(!window.confirm(`Pagar ${formatCurrency(weeklyPot)} para "${camp.title}"?`)) return;

    setLoading(true);
    try {
        const vQuery = query(collection(db, "videos"), where("campaignId", "==", camp.id), where("status", "==", "approved"));
        const vSnap = await getDocs(vQuery);
        const userStatsMap = new Map<string, number>();
        let totalCampaignViews = 0;

        vSnap.forEach(doc => {
            const views = Number(doc.data().views) || 0;
            totalCampaignViews += views;
            userStatsMap.set(doc.data().userId, (userStatsMap.get(doc.data().userId) || 0) + views);
        });

        if (totalCampaignViews === 0) { alert("Sem views para pagar."); setLoading(false); return; }

        const batch = writeBatch(db);
        batch.update(doc(db, "campaigns", camp.id), {
            budget: increment(-weeklyPot), nextPayout: Timestamp.fromDate(getNextMonday())
        });

        userStatsMap.forEach((userViews, userId) => {
            const payout = (userViews / totalCampaignViews) * weeklyPot;
            if (payout > 0) {
                batch.update(doc(db, "users", userId), { saldo: increment(payout), xp: increment(payout * 0.1) });
                batch.set(doc(collection(db, "transactions")), {
                    userId, amount: payout, type: 'weekly_payout', campaignId: camp.id, createdAt: serverTimestamp()
                });
            }
        });

        await batch.commit();
        alert("Sucesso!");
        fetchData();
    } catch (error) { console.error(error); alert("Erro."); } finally { setLoading(false); }
  };

  const handleProcessAll = async () => {
      if (activeCampaigns.length === 0) return;
      if (!window.confirm(`Pagar TODAS as ${activeCampaigns.length} campanhas ativas?`)) return;
      setLoading(true);
      try {
          const batch = writeBatch(db);
          let ops = 0;
          for (const camp of activeCampaigns) {
              const totalDays = getDaysDiff(camp.startDate, camp.endDate);
              const dailyBudget = camp.budget / totalDays;
              const daysRemaining = getDaysDiff(new Date(), camp.endDate);
              let weeklyPot = (daysRemaining < 7 && daysRemaining > 0) ? (dailyBudget * daysRemaining) : (dailyBudget * 7);

              const vSnap = await getDocs(query(collection(db, "videos"), where("campaignId", "==", camp.id), where("status", "==", "approved")));
              const userStatsMap = new Map<string, number>();
              let totalViews = 0;

              vSnap.forEach(d => {
                  const val = Number(d.data().views) || 0;
                  totalViews += val;
                  userStatsMap.set(d.data().userId, (userStatsMap.get(d.data().userId) || 0) + val);
              });

              if (totalViews > 0) {
                  batch.update(doc(db, "campaigns", camp.id), { budget: increment(-weeklyPot), nextPayout: Timestamp.fromDate(getNextMonday()) });
                  ops++;
                  userStatsMap.forEach((views, uid) => {
                      const pay = (views / totalViews) * weeklyPot;
                      if (pay > 0) {
                          batch.update(doc(db, "users", uid), { saldo: increment(pay), xp: increment(pay * 0.1) });
                          batch.set(doc(collection(db, "transactions")), { userId: uid, amount: pay, type: 'weekly_payout', campaignId: camp.id, createdAt: serverTimestamp() });
                          ops++;
                      }
                  });
              }
          }
          if (ops > 0) { await batch.commit(); alert("Pagamento em massa realizado!"); fetchData(); } 
          else { alert("Nada a pagar."); }
      } catch (e) { alert("Erro."); } finally { setLoading(false); }
  };

  const handleLogout = async () => { await signOut(auth); navigate('/login'); };

  if (loading && tab === 'overview') return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-dark)', color: 'var(--text-main)' }}>Carregando Admin...</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', color: 'var(--text-main)', paddingBottom: '40px' }}>
      
      {/* HEADER */}
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', color: '#ef4444' }}>
            <Icons.ShieldCheck size={24} /> Clipay Admin
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: 15}}>
              <div onClick={toggleTheme} style={{ width: '60px', height: '32px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', borderRadius: '30px', position: 'relative' }}>
                <div className="theme-toggle-bg" style={{ position: 'absolute', left: '4px', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', transition: 'transform 0.3s ease', transform: theme === 'dark' ? 'translateX(28px)' : 'translateX(0)' }}></div>
                <div style={{ zIndex: 2, width: '24px', display: 'flex', justifyContent: 'center' }}><Icons.Sun size={14} color={theme === 'light' ? 'white' : 'var(--text-muted)'} /></div>
                <div style={{ zIndex: 2, width: '24px', display: 'flex', justifyContent: 'center' }}><Icons.Moon size={14} color={theme === 'dark' ? 'white' : 'var(--text-muted)'} /></div>
              </div>
              <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}><Icons.LogOut size={18} /> Sair</button>
          </div>
        </div>
      </header>

      <div className="container" style={{ marginTop: '40px' }}>
        
        {/* ABAS DE NAVEGAÇÃO */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 30, borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => setTab('overview')} style={{ padding: '10px 20px', background: 'none', border: 'none', color: tab === 'overview' ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === 'overview' ? '2px solid var(--primary)' : 'none', fontWeight: 'bold', cursor: 'pointer' }}>Visão Geral</button>
            <button onClick={() => setTab('users')} style={{ padding: '10px 20px', background: 'none', border: 'none', color: tab === 'users' ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === 'users' ? '2px solid var(--primary)' : 'none', fontWeight: 'bold', cursor: 'pointer' }}>Usuários</button>
            <button onClick={() => { setTab('transactions'); fetchTransactions(); }} style={{ padding: '10px 20px', background: 'none', border: 'none', color: tab === 'transactions' ? 'var(--primary)' : 'var(--text-muted)', borderBottom: tab === 'transactions' ? '2px solid var(--primary)' : 'none', fontWeight: 'bold', cursor: 'pointer' }}>Transações</button>
        </div>

        {/* --- ABA VISÃO GERAL --- */}
        {tab === 'overview' && (
            <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '40px' }}>
                    <StatCard label="Caixa Total (Escrow)" value={formatCurrency(stats.totalRevenue)} icon={Icons.Wallet} color="#10b981" />
                    <StatCard label="Clipadores Ativos" value={stats.activeClippers} icon={Icons.User} color="#3b82f6" />
                    <StatCard label="Criadores Ativos" value={stats.activeCreators} icon={Icons.Play} color="#8b5cf6" />
                    <StatCard label="Total Visualizações" value={stats.totalViews.toLocaleString()} icon={Icons.BarChart3} color="#ec4899" />
                </div>

                <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icons.AlertCircle color="#fbbf24" /> Aprovações Pendentes ({pendingCampaigns.length})
                </h2>
                {pendingCampaigns.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--text-muted)', marginBottom: 40 }}>Nenhuma campanha pendente.</div>
                ) : (
                    <div style={{ display: 'grid', gap: '15px', marginBottom: 40 }}>
                        {pendingCampaigns.map((camp) => (
                            <div key={camp.id} style={{ background: 'var(--bg-card)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.1rem', margin: 0 }}>{camp.title}</h3>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Orçamento: <strong style={{ color: '#10b981' }}>{formatCurrency(camp.budget)}</strong> • #{camp.requiredHashtag}</p>
                                </div>
                                <button onClick={() => handleApproveCampaign(camp.id, camp.title)} className="btn" style={{ background: '#10b981', color: 'white', border: 'none', fontWeight: 'bold' }}><Icons.CheckCircle size={18} style={{marginRight: 5}}/> Confirmar</button>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 30, marginBottom: 20}}>
                    <h2 style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '10px' }}><Icons.Wallet color="#3b82f6" /> Pagamentos Semanais ({activeCampaigns.length})</h2>
                    {activeCampaigns.length > 0 && <button onClick={handleProcessAll} className="btn" style={{background: '#3b82f6', color: 'white', border: 'none', fontWeight: 'bold', display: 'flex', gap: 8}}><Icons.Wallet size={18} /> Pagar Todos</button>}
                </div>

                {activeCampaigns.length === 0 ? <p style={{color: 'var(--text-muted)'}}>Nenhuma campanha ativa.</p> : (
                    <div style={{ display: 'grid', gap: '15px' }}>
                        {activeCampaigns.map((camp) => {
                            const nextMondayDate = getNextMonday();
                            const countdown = getCountdown(nextMondayDate);
                            return (
                                <div key={camp.id} style={{ background: 'var(--bg-card)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontSize: '1.1rem', margin: 0, marginBottom: 5 }}>{camp.title}</h3>
                                        <div style={{display: 'flex', gap: 15, fontSize: '0.9rem', color: 'var(--text-muted)'}}>
                                            <span>Caixa: <strong style={{color: '#10b981'}}>{formatCurrency(camp.budget)}</strong></span>
                                            <span title={nextMondayDate.toLocaleDateString()}>Próximo: <strong style={{color: '#fbbf24'}}>{countdown}</strong></span>
                                        </div>
                                    </div>
                                    <button onClick={() => handleManualPayout(camp)} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 8, borderColor: '#3b82f6', color: '#3b82f6' }}><Icons.Wallet size={18} /> Pagar Individual</button>
                                </div>
                            )
                        })}
                    </div>
                )}
            </>
        )}

        {/* --- ABA USUÁRIOS --- */}
        {tab === 'users' && (
            <div>
                <h2 style={{ marginBottom: 20 }}>Base de Usuários ({usersList.length})</h2>
                <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                <th style={{ padding: 15 }}>Nome</th>
                                <th style={{ padding: 15 }}>Email</th>
                                <th style={{ padding: 15 }}>Função</th>
                                <th style={{ padding: 15 }}>XP</th>
                                <th style={{ padding: 15 }}>Saldo (R$)</th>
                                <th style={{ padding: 15 }}>Chave PIX</th>
                            </tr>
                        </thead>
                        <tbody>
                            {usersList.map(u => (
                                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: 15, fontWeight: 'bold' }}>{u.name}</td>
                                    <td style={{ padding: 15, color: 'var(--text-muted)' }}>{u.email}</td>
                                    <td style={{ padding: 15 }}><span style={{ padding: '4px 10px', borderRadius: 20, background: u.role === 'admin' ? '#ef444420' : u.role === 'creator' ? '#8b5cf620' : '#3b82f620', color: u.role === 'admin' ? '#ef4444' : u.role === 'creator' ? '#8b5cf6' : '#3b82f6', fontSize: '0.8rem', fontWeight: 'bold' }}>{u.role.toUpperCase()}</span></td>
                                    <td style={{ padding: 15 }}>{u.xp}</td>
                                    <td style={{ padding: 15, color: '#10b981', fontWeight: 'bold' }}>{formatCurrency(u.saldo || 0)}</td>
                                    <td style={{ padding: 15, fontFamily: 'monospace' }}>{u.pixKey || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* --- ABA TRANSAÇÕES --- */}
        {tab === 'transactions' && (
            <div>
                <h2 style={{ marginBottom: 20 }}>Histórico de Pagamentos</h2>
                {loading ? <p>Carregando...</p> : (
                    <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                    <th style={{ padding: 15 }}>Data</th>
                                    <th style={{ padding: 15 }}>Tipo</th>
                                    <th style={{ padding: 15 }}>ID Usuário</th>
                                    <th style={{ padding: 15 }}>ID Campanha</th>
                                    <th style={{ padding: 15 }}>Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactionsList.length === 0 ? <tr><td colSpan={5} style={{padding: 20, textAlign: 'center'}}>Sem registros.</td></tr> : 
                                 transactionsList.map(t => (
                                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: 15, fontSize: '0.9rem' }}>{formatDate(t.createdAt)}</td>
                                        <td style={{ padding: 15 }}>{t.type}</td>
                                        <td style={{ padding: 15, fontSize: '0.8rem', fontFamily: 'monospace' }}>{t.userId}</td>
                                        <td style={{ padding: 15, fontSize: '0.8rem', fontFamily: 'monospace' }}>{t.campaignId || '-'}</td>
                                        <td style={{ padding: 15, color: '#ef4444', fontWeight: 'bold' }}>- {formatCurrency(t.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )}

      </div>
    </div>
  );
}