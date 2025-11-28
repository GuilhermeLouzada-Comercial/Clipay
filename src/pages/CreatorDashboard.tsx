import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// --- TIPOS ---
interface Campaign {
  id: string;
  title: string;
  budget: number;
  cpm: number;
  description: string;
  requiredHashtag: string;
  startDate?: string;
  endDate?: string;
  status: 'active' | 'pending_payment' | 'rejected' | 'finished';
  creatorId: string;
  createdAt: any;
}

interface NewCampaignState {
  title: string;
  budget: string;
  cpm: string;
  description: string;
  hashtag: string;
  mention: string;
  startDate: string;
  endDate: string;
}

interface DashInputProps {
  label: string;
  type?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  prefix?: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}

// --- FUNÇÃO AUXILIAR DE FORMATAÇÃO ---
const formatCurrency = (value: number | string) => {
  const numberValue = Number(value);
  if (isNaN(numberValue)) return 'R$ 0,00';
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(numberValue);
};

// Componente interno de Input para o Dashboard
const DashInput: React.FC<DashInputProps> = ({ label, type = "text", value, onChange, placeholder, prefix }) => (
  <div style={{ marginBottom: '15px' }}>
    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#9ca3af' }}>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid #27272a', borderRadius: '8px', padding: '0 12px' }}>
      {prefix && <span style={{ color: '#9ca3af', marginRight: '8px' }}>{prefix}</span>}
      <input 
        type={type} 
        value={value} 
        onChange={onChange} 
        placeholder={placeholder}
        style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', padding: '12px 0', outline: 'none', colorScheme: 'dark' }}
      />
    </div>
  </div>
);

const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, color }) => (
  <div style={{ background: '#121218', padding: '20px', borderRadius: '12px', border: '1px solid #27272a', display: 'flex', alignItems: 'center', gap: '15px' }}>
    <div style={{ width: '45px', height: '45px', borderRadius: '10px', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}>
      <Icon size={24} />
    </div>
    <div>
      <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'white' }}>{value}</div>
    </div>
  </div>
);

export default function CreatorDashboard() {
  const navigate = useNavigate();
  const [view, setView] = useState<'dashboard' | 'new-campaign'>('dashboard');
  const [userName, setUserName] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Estado do formulário de nova campanha
  const [newCampaign, setNewCampaign] = useState<NewCampaignState>({
    title: '',
    budget: '',
    cpm: '', 
    description: '',
    hashtag: '',
    mention: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        setUserName(auth.currentUser.displayName || 'Criador');
        const q = query(collection(db, "campaigns"), where("creatorId", "==", auth.currentUser.uid));
        const querySnapshot = await getDocs(q);
        const userCampaigns = querySnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        })) as Campaign[];
        setCampaigns(userCampaigns);
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      const budgetVal = parseFloat(newCampaign.budget);
      const cpmVal = parseFloat(newCampaign.cpm);
      const cleanHashtag = newCampaign.hashtag.replace('#', '').trim();
      const cleanMention = newCampaign.mention.replace('@', '').trim();

      const docRef = await addDoc(collection(db, "campaigns"), {
        creatorId: auth.currentUser.uid,
        title: newCampaign.title,
        budget: budgetVal,
        cpm: cpmVal,
        description: newCampaign.description,
        requiredHashtag: cleanHashtag,
        requiredMention: cleanMention, 
        startDate: newCampaign.startDate, // Novo Campo
        endDate: newCampaign.endDate,     // Novo Campo
        status: 'pending_payment', 
        createdAt: serverTimestamp()
      });

      const message = `Olá! Criei a campanha "${newCampaign.title}" (ID: ${docRef.id}).\n\nOrçamento: ${formatCurrency(budgetVal)}\nCPM: ${formatCurrency(cpmVal)}\nPrazo: ${newCampaign.startDate} até ${newCampaign.endDate}\n\nAguardo instruções para o PIX.`;
      const whatsappUrl = `https://wa.me/553133601286?text=${encodeURIComponent(message)}`;

      window.open(whatsappUrl, '_blank');
      setView('dashboard');
      setNewCampaign({ title: '', budget: '', cpm: '', description: '', hashtag: '', mention: '', startDate: '', endDate: '' });
      alert("Campanha criada! Finalize o pagamento no WhatsApp para ativar.");

    } catch (error) {
      console.error("Erro ao criar campanha:", error);
      alert("Erro ao criar campanha. Tente novamente.");
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b0f', color: 'white', paddingBottom: '40px' }}>
      <header style={{ background: 'rgba(18, 18, 24, 0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #27272a', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            <Icons.Play fill="url(#gradient)" size={24} />
            Clipay Creator
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontSize: '0.9rem', color: '#9ca3af' }}>Olá, {userName}</span>
            <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <Icons.LogOut size={18} /> Sair
            </button>
          </div>
        </div>
      </header>

      <div className="container" style={{ marginTop: '40px', padding: '0 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '5px' }}>
              {view === 'dashboard' ? 'Visão Geral' : 'Nova Campanha'}
            </h1>
            <p style={{ color: '#9ca3af' }}>
              {view === 'dashboard' ? 'Acompanhe o desempenho dos seus vídeos.' : 'Preencha os dados para lançar seu desafio.'}
            </p>
          </div>
          {view === 'dashboard' && (
            <button onClick={() => setView('new-campaign')} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}><Icons.Plus size={20} /> Nova Campanha</button>
          )}
          {view === 'new-campaign' && (
            <button onClick={() => setView('dashboard')} className="btn btn-outline" style={{ padding: '10px 20px' }}>Cancelar</button>
          )}
        </div>

        {view === 'dashboard' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '40px' }}>
              <StatCard label="Investimento Total" value={formatCurrency(campaigns.reduce((acc, curr) => acc + curr.budget, 0))} icon={Icons.Wallet} color="#3b82f6" />
              <StatCard label="Campanhas Ativas" value={campaigns.filter(c => c.status === 'active').length} icon={Icons.Trophy} color="#fbbf24" />
              <StatCard label="Views Totais" value="0" icon={Icons.BarChart3} color="#10b981" />
            </div>

            <h2 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>Minhas Campanhas</h2>
            {loading ? <p style={{ color: '#9ca3af' }}>Carregando...</p> : campaigns.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#121218', borderRadius: '12px', border: '1px dashed #27272a' }}>
                <Icons.Trophy size={40} style={{ color: '#3b82f6', marginBottom: '15px', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1.2rem', marginBottom: '10px' }}>Nenhuma campanha encontrada</h3>
                <button onClick={() => setView('new-campaign')} className="btn btn-outline">Criar Agora</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '15px' }}>
                {campaigns.map((camp) => (
                  <div key={camp.id} style={{ background: '#121218', padding: '20px', borderRadius: '12px', border: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '5px', color: 'white' }}>{camp.title}</h3>
                      <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', color: '#9ca3af', alignItems: 'center' }}>
                        <span>Orçamento: <strong style={{ color: '#10b981' }}>{formatCurrency(camp.budget)}</strong></span>
                        <span>CPM: {formatCurrency(camp.cpm)}</span>
                        {camp.endDate && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Icons.Clock size={14} /> Até {new Date(camp.endDate).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ 
                        padding: '5px 12px', 
                        borderRadius: '20px', 
                        fontSize: '0.8rem', 
                        fontWeight: '600',
                        background: camp.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                        color: camp.status === 'active' ? '#10b981' : '#fbbf24'
                      }}>
                        {camp.status === 'active' ? 'Ativa' : 'Pagamento Pendente'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ maxWidth: '600px', margin: '0 auto', background: '#121218', padding: '30px', borderRadius: '16px', border: '1px solid #27272a' }}>
            <form onSubmit={handleCreateCampaign}>
              <DashInput label="Título da Campanha" placeholder="Ex: Desafio Copa do Mundo" value={newCampaign.title} onChange={(e) => setNewCampaign({...newCampaign, title: e.target.value})} />
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <DashInput label="Orçamento Total" type="number" placeholder="1000" prefix="R$" value={newCampaign.budget} onChange={(e) => setNewCampaign({...newCampaign, budget: e.target.value})} />
                <DashInput label="Valor por 1k Views (CPM)" type="number" placeholder="10" prefix="R$" value={newCampaign.cpm} onChange={(e) => setNewCampaign({...newCampaign, cpm: e.target.value})} />
              </div>

              {/* NOVOS CAMPOS DE DATA */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <DashInput label="Início da Campanha" type="date" value={newCampaign.startDate} onChange={(e) => setNewCampaign({...newCampaign, startDate: e.target.value})} />
                <DashInput label="Fim da Campanha" type="date" value={newCampaign.endDate} onChange={(e) => setNewCampaign({...newCampaign, endDate: e.target.value})} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <DashInput label="Hashtag Obrigatória" placeholder="Ex: ClipayOficial" prefix="#" value={newCampaign.hashtag} onChange={(e) => setNewCampaign({...newCampaign, hashtag: e.target.value.replace(/#/g, '').replace(/\s/g, '')})} />
                <DashInput label="Conta para Marcar (@)" placeholder="Ex: podpah" prefix="@" value={newCampaign.mention} onChange={(e) => setNewCampaign({...newCampaign, mention: e.target.value.replace(/@/g, '').replace(/\s/g, '')})} />
              </div>
              
              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#9ca3af' }}>Regras e Descrição</label>
                <textarea rows={4} value={newCampaign.description} onChange={(e) => setNewCampaign({...newCampaign, description: e.target.value})} placeholder="Descreva o que você espera dos clipadores..." style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #27272a', borderRadius: '8px', padding: '12px', color: 'white', outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
              </div>

              <button type="submit" className="btn btn-primary btn-block" style={{ width: '100%', padding: '15px', fontSize: '1rem' }}>Criar e Pagar via WhatsApp</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}