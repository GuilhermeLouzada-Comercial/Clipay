import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// Componente interno de Input para o Dashboard
const DashInput = ({ label, type = "text", value, onChange, placeholder, prefix }) => (
  <div style={{ marginBottom: '15px' }}>
    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#9ca3af' }}>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid #27272a', borderRadius: '8px', padding: '0 12px' }}>
      {prefix && <span style={{ color: '#9ca3af', marginRight: '8px' }}>{prefix}</span>}
      <input 
        type={type} 
        value={value} 
        onChange={onChange} 
        placeholder={placeholder}
        style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', padding: '12px 0', outline: 'none' }}
      />
    </div>
  </div>
);

export default function CreatorDashboard() {
  const navigate = useNavigate();
  const [view, setView] = useState('dashboard'); // 'dashboard' ou 'new-campaign'
  const [userName, setUserName] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estado do formulário de nova campanha
  const [newCampaign, setNewCampaign] = useState({
    title: '',
    budget: '',
    cpm: '', // Custo por mil views
    description: '',
    hashtag: ''
  });

  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        setUserName(auth.currentUser.displayName || 'Criador');
        
        // Busca campanhas deste usuário
        const q = query(collection(db, "campaigns"), where("creatorId", "==", auth.currentUser.uid));
        const querySnapshot = await getDocs(q);
        const userCampaigns = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    
    try {
      // 1. Salva a campanha no banco como "Pendente de Pagamento"
      const docRef = await addDoc(collection(db, "campaigns"), {
        creatorId: auth.currentUser.uid,
        title: newCampaign.title,
        budget: parseFloat(newCampaign.budget),
        cpm: parseFloat(newCampaign.cpm),
        description: newCampaign.description,
        requiredHashtag: newCampaign.hashtag,
        status: 'pending_payment', // Status inicial
        createdAt: serverTimestamp()
      });

      // 2. Gera a mensagem para o WhatsApp
      const message = `Olá! Acabei de criar a campanha "${newCampaign.title}" na Clipay (ID: ${docRef.id}).\n\nOrçamento: R$ ${newCampaign.budget}\nCPM: R$ ${newCampaign.cpm}\n\nGostaria de realizar o pagamento via PIX para ativar a campanha.`;
      
      const whatsappUrl = `https://wa.me/553133601286?text=${encodeURIComponent(message)}`;

      // 3. Redireciona para o WhatsApp
      window.open(whatsappUrl, '_blank');
      
      // 4. Volta para o dashboard e limpa form
      setView('dashboard');
      setNewCampaign({ title: '', budget: '', cpm: '', description: '', hashtag: '' });
      alert("Campanha criada! Finalize o pagamento no WhatsApp para ativar.");

    } catch (error) {
      console.error("Erro ao criar campanha:", error);
      alert("Erro ao criar campanha. Tente novamente.");
    }
  };

  // Componente Visual do Card de Estatística
  const StatCard = ({ label, value, icon: Icon, color }) => (
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

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b0f', color: 'white', paddingBottom: '40px' }}>
      {/* Navbar Logada */}
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
        
        {/* Header da Página */}
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
            <button 
              onClick={() => setView('new-campaign')}
              className="btn btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
            >
              <Icons.Plus size={20} /> Nova Campanha
            </button>
          )}
          {view === 'new-campaign' && (
            <button 
              onClick={() => setView('dashboard')}
              className="btn btn-outline" 
              style={{ padding: '10px 20px' }}
            >
              Cancelar
            </button>
          )}
        </div>

        {view === 'dashboard' ? (
          <>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '40px' }}>
              <StatCard label="Investimento Total" value={`R$ ${campaigns.reduce((acc, curr) => acc + curr.budget, 0)}`} icon={Icons.Wallet} color="#3b82f6" />
              <StatCard label="Campanhas Ativas" value={campaigns.filter(c => c.status === 'active').length} icon={Icons.Trophy} color="#fbbf24" />
              <StatCard label="Views Totais" value="0" icon={Icons.BarChart3} color="#10b981" />
            </div>

            {/* Lista de Campanhas */}
            <h2 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>Minhas Campanhas</h2>
            {loading ? (
              <p style={{ color: '#9ca3af' }}>Carregando...</p>
            ) : campaigns.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#121218', borderRadius: '12px', border: '1px dashed #27272a' }}>
                <Icons.Trophy size={40} style={{ color: '#3b82f6', marginBottom: '15px', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1.2rem', marginBottom: '10px' }}>Nenhuma campanha encontrada</h3>
                <p style={{ color: '#9ca3af', marginBottom: '20px' }}>Crie sua primeira campanha para começar a receber vídeos.</p>
                <button onClick={() => setView('new-campaign')} className="btn btn-outline">Criar Agora</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '15px' }}>
                {campaigns.map((camp) => (
                  <div key={camp.id} style={{ background: '#121218', padding: '20px', borderRadius: '12px', border: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '5px', color: 'white' }}>{camp.title}</h3>
                      <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', color: '#9ca3af' }}>
                        <span>Orçamento: R$ {camp.budget}</span>
                        <span>CPM: R$ {camp.cpm}</span>
                        <span style={{ color: '#3b82f6' }}>#{camp.requiredHashtag}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
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
                      <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '8px 15px' }}>Ver Detalhes</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Formulário de Nova Campanha */
          <div style={{ maxWidth: '600px', margin: '0 auto', background: '#121218', padding: '30px', borderRadius: '16px', border: '1px solid #27272a' }}>
            <form onSubmit={handleCreateCampaign}>
              <DashInput 
                label="Título da Campanha" 
                placeholder="Ex: Desafio Copa do Mundo" 
                value={newCampaign.title}
                onChange={(e) => setNewCampaign({...newCampaign, title: e.target.value})}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <DashInput 
                  label="Orçamento Total (R$)" 
                  type="number" 
                  placeholder="1000" 
                  prefix="R$"
                  value={newCampaign.budget}
                  onChange={(e) => setNewCampaign({...newCampaign, budget: e.target.value})}
                />
                <DashInput 
                  label="Valor por 1k Views (CPM)" 
                  type="number" 
                  placeholder="10" 
                  prefix="R$"
                  value={newCampaign.cpm}
                  onChange={(e) => setNewCampaign({...newCampaign, cpm: e.target.value})}
                />
              </div>
              <DashInput 
                label="Hashtag Obrigatória" 
                placeholder="Ex: ClipayOficial (sem #)" 
                prefix="#"
                value={newCampaign.hashtag}
                onChange={(e) => setNewCampaign({...newCampaign, hashtag: e.target.value})}
              />
              
              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#9ca3af' }}>Regras e Descrição</label>
                <textarea 
                  rows="4"
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign({...newCampaign, description: e.target.value})}
                  placeholder="Descreva o que você espera dos clipadores..."
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #27272a', borderRadius: '8px', padding: '12px', color: 'white', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '15px', borderRadius: '8px', marginBottom: '25px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <div style={{ display: 'flex', gap: '10px', color: '#3b82f6', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.9rem' }}>
                  <Icons.AlertCircle size={18} />
                  Como funciona o pagamento?
                </div>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', lineHeight: '1.5' }}>
                  Ao criar a campanha, você será redirecionado para o WhatsApp do suporte financeiro da Clipay (+55 31 3360-1286) para realizar o depósito do orçamento via PIX. Sua campanha será ativada imediatamente após a confirmação.
                </p>
              </div>

              <button type="submit" className="btn btn-primary btn-block" style={{ width: '100%', padding: '15px', fontSize: '1rem' }}>
                Criar e Pagar via WhatsApp
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}