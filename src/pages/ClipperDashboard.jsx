import React, { useState, useEffect } from 'react';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// Componente de Card de Estatística
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

export default function ClipperDashboard() {
  const navigate = useNavigate();
  const [view, setView] = useState('overview'); // overview, rankings, settings
  const [userData, setUserData] = useState({ name: '', pixKey: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        const docRef = doc(db, "users", auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        }
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
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

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b0f', color: 'white', paddingBottom: '40px' }}>
      {/* Navbar Logada */}
      <header style={{ background: 'rgba(18, 18, 24, 0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #27272a', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', color: '#3b82f6' }}>
            <Icons.Play fill="#3b82f6" size={24} />
            Clipay Clipper
          </div>
          
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            {/* Menu de Navegação Desktop */}
            <nav style={{ display: 'flex', gap: '15px' }}>
              <button onClick={() => setView('overview')} style={{ background: 'none', border: 'none', color: view === 'overview' ? 'white' : '#9ca3af', cursor: 'pointer', fontWeight: view === 'overview' ? 'bold' : 'normal' }}>Visão Geral</button>
              <button onClick={() => setView('rankings')} style={{ background: 'none', border: 'none', color: view === 'rankings' ? 'white' : '#9ca3af', cursor: 'pointer', fontWeight: view === 'rankings' ? 'bold' : 'normal' }}>Rankings</button>
              <button onClick={() => setView('settings')} style={{ background: 'none', border: 'none', color: view === 'settings' ? 'white' : '#9ca3af', cursor: 'pointer', fontWeight: view === 'settings' ? 'bold' : 'normal' }}>Configurações</button>
            </nav>
            
            <div style={{ width: '1px', height: '20px', background: '#27272a' }}></div>
            
            <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <Icons.LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="container" style={{ marginTop: '40px', padding: '0 20px' }}>
        
        {/* --- VISÃO GERAL --- */}
        {view === 'overview' && (
          <>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '5px' }}>Olá, {userData.name || 'Clipador'}</h1>
            <p style={{ color: '#9ca3af', marginBottom: '30px' }}>Veja seus resultados e ganhos.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '40px' }}>
              <StatCard label="Saldo Disponível" value="R$ 0,00" icon={Icons.Wallet} color="#10b981" />
              <StatCard label="Views Totais" value="0" icon={Icons.BarChart3} color="#3b82f6" />
              <StatCard label="Vídeos Postados" value="0" icon={Icons.Play} color="#fbbf24" />
            </div>

            <h2 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>Campanhas Recentes</h2>
            <div style={{ padding: '40px', textAlign: 'center', background: '#121218', borderRadius: '12px', border: '1px dashed #27272a' }}>
              <p style={{ color: '#9ca3af' }}>Você ainda não participou de nenhuma campanha.</p>
            </div>
          </>
        )}

        {/* --- RANKINGS --- */}
        {view === 'rankings' && (
          <>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '30px' }}>Rankings</h1>
            
            <div style={{ background: '#121218', borderRadius: '12px', border: '1px solid #27272a', overflow: 'hidden' }}>
              <div style={{ padding: '20px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Copa Clipay (Exemplo)</h3>
                <span style={{ background: '#3b82f6', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>Em Andamento</span>
              </div>
              <div style={{ padding: '20px' }}>
                {/* Mock de Ranking */}
                {[
                  { rank: 1, name: 'PedroCortes', views: '1.2M', prize: 'R$ 500' },
                  { rank: 2, name: 'AnaClips', views: '900K', prize: 'R$ 300' },
                  { rank: 3, name: 'JoãoViral', views: '850K', prize: 'R$ 150' },
                  { rank: 4, name: 'Você', views: '0', prize: '-' },
                ].map((item, i) => (
                  <div key={i} style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', 
                    borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    opacity: item.name === 'Você' ? 1 : 0.7,
                    background: item.name === 'Você' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    paddingLeft: item.name === 'Você' ? '10px' : '0',
                    paddingRight: item.name === 'Você' ? '10px' : '0',
                    borderRadius: '8px'
                  }}>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', color: item.rank === 1 ? '#fbbf24' : item.rank === 2 ? '#9ca3af' : item.rank === 3 ? '#b45309' : 'white', width: '20px' }}>#{item.rank}</span>
                      <span>{item.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', textAlign: 'right' }}>
                      <span style={{ color: '#9ca3af' }}>{item.views} views</span>
                      <span style={{ fontWeight: 'bold', color: '#10b981', width: '60px' }}>{item.prize}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* --- CONFIGURAÇÕES --- */}
        {view === 'settings' && (
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '30px' }}>Meus Dados</h1>
            
            <div style={{ background: '#121218', padding: '30px', borderRadius: '16px', border: '1px solid #27272a' }}>
              <form onSubmit={handleSaveSettings}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#9ca3af' }}>Nome Completo</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid #27272a', borderRadius: '8px', padding: '0 12px' }}>
                    <input 
                      type="text" 
                      value={userData.name} 
                      onChange={(e) => setUserData({...userData, name: e.target.value})} 
                      style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', padding: '12px 0', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#9ca3af' }}>E-mail (Não alterável)</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid #27272a', borderRadius: '8px', padding: '0 12px' }}>
                    <input 
                      type="text" 
                      value={userData.email} 
                      disabled
                      style={{ background: 'transparent', border: 'none', color: '#6b7280', width: '100%', padding: '12px 0', outline: 'none', cursor: 'not-allowed' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '25px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#10b981', fontWeight: 'bold' }}>Chave PIX (Para Recebimento)</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid #10b981', borderRadius: '8px', padding: '0 12px' }}>
                    <input 
                      type="text" 
                      placeholder="CPF, E-mail, Telefone ou Aleatória"
                      value={userData.pixKey || ''} 
                      onChange={(e) => setUserData({...userData, pixKey: e.target.value})} 
                      style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', padding: '12px 0', outline: 'none' }}
                    />
                  </div>
                  <small style={{ color: '#9ca3af', marginTop: '5px', display: 'block' }}>Certifique-se que a chave está correta para evitar problemas no pagamento.</small>
                </div>

                <button type="submit" className="btn btn-primary btn-block" style={{ width: '100%', padding: '15px', fontSize: '1rem' }} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}