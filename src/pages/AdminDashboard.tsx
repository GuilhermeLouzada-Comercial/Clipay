import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// 1. Definimos a "forma" que uma Campanha tem
interface CampaignData {
  id: string;
  title: string;
  budget: number;
  cpm: number;
  requiredHashtag: string;
  status: string;
  creatorId?: string;
  createdAt?: any;
}

// 2. Definimos a "forma" das estatísticas
interface DashboardStats {
  totalRevenue: number;
  nextPayments: number;
  totalViews: number;
  totalVideos: number;
  activeClippers: number;
  activeCreators: number;
}

// 3. Tipagem das props do Card
interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType; // Aceita um componente (como Icons.Wallet)
  color: string;
}

// Componente de Card
const StatCard: React.FC<StatCardProps> = ({ label, value, subtext, icon: Icon, color }) => (
  <div style={{ background: '#121218', padding: '20px', borderRadius: '12px', border: '1px solid #27272a', display: 'flex', alignItems: 'center', gap: '15px' }}>
    <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}>
      <Icon size={24} />
    </div>
    <div>
      <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'white' }}>{value}</div>
      {subtext && <div style={{ fontSize: '0.75rem', color: color, marginTop: '2px' }}>{subtext}</div>}
    </div>
  </div>
);

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  
  // Estados tipados com as interfaces criadas acima
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    nextPayments: 0,
    totalViews: 0,
    totalVideos: 0,
    activeClippers: 0,
    activeCreators: 0
  });

  const [pendingCampaigns, setPendingCampaigns] = useState<CampaignData[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // 1. Buscar Usuários
      const usersSnap = await getDocs(collection(db, "users"));
      let clippers = 0;
      let creators = 0;
      
      usersSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.role === 'clipper') clippers++;
        if (data.role === 'creator') creators++;
      });

      // 2. Buscar Campanhas
      const campaignsSnap = await getDocs(collection(db, "campaigns"));
      let revenue = 0;
      const pending: CampaignData[] = [];
      
      campaignsSnap.forEach(docSnap => {
        // Aqui dizemos ao TS que os dados são do tipo CampaignData
        const data = docSnap.data() as Omit<CampaignData, 'id'>;
        
        // Soma ao caixa se a campanha não foi rejeitada
        if (data.status !== 'rejected') {
          // O TS garante que data.budget é number. Se vier string do banco, ideal seria converter: Number(data.budget)
          revenue += Number(data.budget) || 0;
        }
        
        // Filtra campanhas pendentes
        if (data.status === 'pending_payment' || data.status === 'pending_approval') {
          pending.push({ id: docSnap.id, ...data });
        }
      });

      // 3. Placeholder para vídeos
      const totalVids = 0; 
      const views = 0;     

      setStats({
        totalRevenue: revenue,
        nextPayments: revenue * 0.3,
        totalViews: views,
        totalVideos: totalVids,
        activeClippers: clippers,
        activeCreators: creators
      });

      setPendingCampaigns(pending);
      setLoading(false);

    } catch (error) {
      console.error("Erro ao buscar dados do admin:", error);
      setLoading(false);
    }
  };

  const handleApproveCampaign = async (campaignId: string, currentTitle: string) => {
    if(!window.confirm(`Confirmar o recebimento do PIX para a campanha "${currentTitle}"?`)) return;

    try {
      const campaignRef = doc(db, "campaigns", campaignId);
      await updateDoc(campaignRef, {
        status: 'active',
        approvedAt: new Date() 
      });
      
      // Atualiza a lista localmente
      setPendingCampaigns(prev => prev.filter(c => c.id !== campaignId));
      alert("Campanha ativada com sucesso!");
    } catch (error) {
      console.error("Erro ao aprovar:", error);
      alert("Erro ao aprovar campanha.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  if (loading) {
    return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0b0b0f', color: 'white' }}>Carregando Painel Admin...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b0f', color: 'white', paddingBottom: '40px' }}>
      {/* Navbar Admin */}
      <header style={{ background: '#1a1a23', borderBottom: '1px solid #27272a', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', color: '#ef4444' }}>
            <Icons.ShieldCheck size={24} />
            Clipay Admin
          </div>
          <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Icons.LogOut size={18} /> Sair
          </button>
        </div>
      </header>

      <div className="container" style={{ marginTop: '40px' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '30px' }}>Visão Geral do Negócio</h1>

        {/* Grid de Estatísticas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '40px' }}>
          <StatCard 
            label="Caixa Total (Escrow)" 
            value={`R$ ${stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
            icon={Icons.Wallet} 
            color="#10b981" 
          />
          <StatCard 
            label="Pagamentos (7 dias)" 
            value={`R$ ${stats.nextPayments.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
            subtext="Estimativa baseada em metas"
            icon={Icons.Clock} 
            color="#fbbf24" 
          />
          <StatCard 
            label="Clipadores Ativos" 
            value={stats.activeClippers} 
            icon={Icons.User} 
            color="#3b82f6" 
          />
          <StatCard 
            label="Criadores Ativos" 
            value={stats.activeCreators} 
            icon={Icons.Play} 
            color="#8b5cf6" 
          />
          <StatCard 
            label="Total Visualizações" 
            value={stats.totalViews} 
            icon={Icons.BarChart3} 
            color="#ec4899" 
          />
          <StatCard 
            label="Vídeos Registrados" 
            value={stats.totalVideos} 
            icon={Icons.Trophy} 
            color="#6366f1" 
          />
        </div>

        {/* Área de Aprovação de Campanhas */}
        <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icons.AlertCircle color="#fbbf24" />
          Aprovações Pendentes ({pendingCampaigns.length})
        </h2>

        {pendingCampaigns.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', background: '#121218', borderRadius: '12px', border: '1px dashed #27272a', color: '#9ca3af' }}>
            Nenhuma campanha aguardando aprovação no momento.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '15px' }}>
            {pendingCampaigns.map((camp) => (
              <div key={camp.id} style={{ background: '#121218', padding: '25px', borderRadius: '12px', border: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                    <h3 style={{ fontSize: '1.1rem', color: 'white', margin: 0 }}>{camp.title}</h3>
                    <span style={{ fontSize: '0.75rem', background: '#fbbf2420', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px' }}>Aguardando PIX</span>
                  </div>
                  <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: 0 }}>
                    Orçamento: <strong style={{ color: '#10b981' }}>R$ {camp.budget}</strong> • CPM: R$ {camp.cpm} • Hashtag: #{camp.requiredHashtag}
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '5px' }}>ID: {camp.id}</p>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => handleApproveCampaign(camp.id, camp.title)}
                    className="btn"
                    style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Icons.CheckCircle size={18} />
                    Confirmar Pagamento
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}