import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// --- UTILITÁRIOS ---

// Gera número aleatório entre min e max
function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomFloat(min: number, max: number) {
  return (Math.random() * (max - min + 1) + min);
}

// Formata moeda (R$)
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2, // Garante que sempre mostre os centavos (ex: ,00)
    maximumFractionDigits: 2,
  }).format(value);
};


// Formata números compactos (ex: 1.2M, 850K)
const formatCompact = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
};

// Gera um array de alturas para o gráfico com tendência de crescimento
const generateGrowthData = (length: number) => {
  const data: number[] = [];
  let current = 30; // Começa em 30%
  for (let i = 0; i < length; i++) {
    // Adiciona um valor aleatório que tende a ser positivo (crescimento)
    // Variação entre -10 e +25
    const change = getRandomFloat(-10, 25);
    current += change;
    
    // Mantém entre 20% e 100%
    if (current > 100) current *= 0.85;
    if (current < 20) current = 20;
    
    data.push(current);
  }
  // Garante que o último seja alto para dar sensação de sucesso
  data[data.length - 1] = getRandomFloat(85, 100);
  return data;
};

// --- TIPOS ---
type Role = 'creator' | 'clipper';

interface UserState {
  name: string;
  role: string;
  uid: string;
}

interface HeaderProps {
  user: UserState | null;
  loading: boolean;
}

interface HeroProps {
  activeRole: Role;
  setActiveRole: (role: Role) => void;
}

interface RolesSectionProps {
  activeRole: Role;
  setActiveRole: (role: Role) => void;
}

// --- COMPONENTES ---

const Header = ({ user, loading }: HeaderProps) => (
  <header className="header">
    <div className="container nav-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <div className="logo">
          <Icons.Play fill={'url(#gradient)'} size={28} />
          Clipay
        </div>
      </Link>
      
      <nav className="nav-links">
        <a href="#features" className="nav-link">Funcionalidades</a>
        <a href="#roles" className="nav-link">Para Quem?</a>
        <a href="#pricing" className="nav-link">Preços</a>
      </nav>

      <div className="nav-buttons" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        {loading ? (
          <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>...</span>
        ) : user ? (
          // ESTADO LOGADO
          <>
            <span style={{ color: 'white', fontWeight: 500, fontSize: '0.95rem' }}>
              Olá, {user.name.split(' ')[0]}
            </span>
            <Link to={user.role === 'creator' ? '/creator-dashboard' : user.role === 'admin' ? '/admin-dashboard' : '/clipper-dashboard'}>
              <button className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '0.9rem' }}>
                Dashboard <Icons.ArrowRight size={16} style={{ marginLeft: 5 }} />
              </button>
            </Link>
          </>
        ) : (
          // ESTADO DESLOGADO
          <>
            <Link to="/login">
              <button className="btn btn-outline hide-mobile">Login</button>
            </Link>
            <Link to="/signup">
              <button className="btn btn-primary">Começar Agora</button>
            </Link>
          </>
        )}
      </div>
    </div>

    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <linearGradient id="gradient" x1="100%" y1="100%" x2="0%" y2="0%">
        <stop stopColor="#3b82f6" offset="0%" />
        <stop stopColor="#8b5cf6" offset="100%" />
      </linearGradient>
    </svg>
  </header>
);

const DashboardPreview = ({ role }: { role: Role }) => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // LÓGICA ORGÂNICA: Gera dados aleatórios e crescentes apenas uma vez ao carregar
  const dashboardData = useMemo(() => {
    const id = getRandomInt(10000, 99999);
    const rawHeights = generateGrowthData(12); // Gera as alturas (12 barras)

    // AQUI ESTÁ A CORREÇÃO:
    // Removemos o Math.random() do cálculo do valor.
    // Agora o valor é diretamente proporcional à altura (height).
    const bars = rawHeights.map((height) => {
      if (role === 'creator') {
        // Ex: Se a altura for 80, será 80 * 0.25 = 20.0M Views
        // Isso garante que barra maior = número maior
        const viewCount = (height * 0.06).toFixed(1);
        return {
          height,
          tooltip: `${viewCount}M Views`
        };
      } else {
        // Lógica do clipador
        // Ex: Altura 80 * 18 = R$ 1.440,00
        return {
          height,
          tooltip: formatCurrency(height * 18)
        };
      }
    });

    if (role === 'creator') {
      const revenue = getRandomFloat(80000, 250000); 
      const views = getRandomInt(15000000, 45000000); 
      const videos = getRandomInt(500, 1200);
      const clippers = getRandomInt(80, 300);

      return {
        id,
        title: 'Dashboard Criador',
        mainLabel: 'Saldo da Campanha',
        mainValue: formatCurrency(revenue),
        btnText: '+ Nova Campanha',
        stats: [
          { val: `+${formatCompact(views)}`, label: 'Views Totais', color: 'var(--success)' },
          { val: videos.toString(), label: 'Vídeos Aprovados', color: 'white' },
          { val: clippers.toString(), label: 'Clipadores Ativos', color: 'white' },
        ],
        graphLabel: 'Visualizações Semanais',
        graphColor: 'var(--gradient-main)',
        bars, 
      };
    } else {
      const balance = getRandomFloat(2500, 18000); 
      const rank = getRandomInt(1, 15);
      const videos = getRandomInt(20, 150);
      const bonus = getRandomFloat(100, 1000);

      return {
        id,
        title: 'Dashboard Clipador',
        mainLabel: 'Disponível para Saque',
        mainValue: formatCurrency(balance),
        btnText: 'Solicitar Pix',
        stats: [
          { val: `#${rank}`, label: 'Ranking Global', color: 'var(--warning)' },
          { val: videos.toString(), label: 'Vídeos Postados', color: 'white' },
          { val: formatCurrency(bonus), label: 'Bônus Hoje', color: 'var(--success)' },
        ],
        graphLabel: 'Ganhos Semanais',
        graphColor: 'var(--gradient-clipper)',
        bars,
      };
    }
  }, [role]);

  return (
    <div className="dashboard-preview">
      <div className="dash-title-bar">
        <div className="dash-indicator"></div>
        {dashboardData.title + ' #' + dashboardData.id}
      </div>

      <div className="dash-header">
        <div>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
            {dashboardData.mainLabel}
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>
            {dashboardData.mainValue}
          </div>
        </div>
        <button
          className="btn btn-primary dash-action-btn"
          style={{ padding: '5px 15px', fontSize: '0.8rem', cursor: 'default' }}
        >
          {dashboardData.btnText}
        </button>
      </div>

      <div className="dash-stats">
        {dashboardData.stats.map((stat, index) => (
          <div key={index} className="stat-box">
            <div className="stat-val" style={{ color: stat.color }}>
              {stat.val}
            </div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="graph-container">
        <div className="graph-label">{dashboardData.graphLabel}</div>
        <div
          style={{
            height: '150px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
          }}
        >
          {dashboardData.bars.map((bar, i) => (
            <div
              key={i}
              className="bar-interactive"
              onMouseEnter={() => setHoveredBar(i)}
              onMouseLeave={() => setHoveredBar(null)}
              style={{
                width: '100%',
                height: `${bar.height}%`, 
                background: dashboardData.graphColor,
                opacity: 0.4 + (i / dashboardData.bars.length) * 0.6,
                borderRadius: '4px 4px 0 0',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              {hoveredBar === i && (
                <div className="chart-tooltip">
                  {bar.tooltip}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Hero = ({ activeRole, setActiveRole }: HeroProps) => (
  <section className="hero">
    <div className="hero-bg-wrapper">
      <img
        src="https://media.istockphoto.com/id/1405608734/vector/glowing-neon-lines-tunnel-led-arcade-stage-abstract-technology-background-virtual-reality.jpg?s=612x612&w=0&k=20&c=6qvHGCesp7DYYkYLUlBI1f_JnWQWsQDutY769MYLPu0="
        alt="Abstract Neon Background"
        className="hero-bg-img"
      />
      <div className="hero-bg-overlay"></div>
    </div>

    <div className="container">
      <div className="hero-tag">Plataforma Beta - Acesso Antecipado</div>
      <h1 className="hero-title">
        O Fim da Desorganização <br />
        <span>No Mundo dos Cortes</span>
      </h1>
      <p className="hero-subtitle">
        Integramos Criadores e Clipadores em um único ecossistema. Sem taxas de
        adm, sem planilhas manuais e pagamentos automatizados.
      </p>

      <div className="hero-buttons">
        <button
          className={
            activeRole === 'creator' ? 'btn btn-active-role' : 'btn btn-outline'
          }
          onClick={() => setActiveRole('creator')}
          style={{ fontWeight: 'bold', minWidth: '200px' }}
        >
          Sou Criador de Conteúdo
        </button>
        <button
          className={
            activeRole === 'clipper' ? 'btn btn-active-role' : 'btn btn-outline'
          }
          onClick={() => setActiveRole('clipper')}
          style={{ fontWeight: 'bold', minWidth: '200px' }}
        >
          Sou Clipador
        </button>
      </div>

      <DashboardPreview role={activeRole} />
    </div>
  </section>
);

const RolesSection = ({ activeRole, setActiveRole }: RolesSectionProps) => {
  const creatorFeatures = [
    {
      Icon: Icons.BarChart3,
      title: 'ROI em Tempo Real',
      desc: 'Saiba exatamente quanto cada visualização está custando e o retorno sobre investimento da sua campanha.',
    },
    {
      Icon: Icons.Wallet,
      title: 'Pagamentos Centralizados',
      desc: 'Esqueça fazer 50 PIX manuais. Deposite um valor único e nós distribuímos conforme as metas.',
    },
    {
      Icon: Icons.ShieldCheck,
      title: 'Controle de Qualidade',
      desc: 'Aprove ou rejeite vídeos antes do pagamento ser liberado. Defina regras claras de monetização.',
    },
  ];

  const clipperFeatures = [
    {
      Icon: Icons.Trophy,
      title: 'Rankings Competitivos',
      desc: 'Visualize sua posição no ranking global e da campanha. Gamificação real para aumentar seus ganhos.',
    },
    {
      Icon: Icons.LineChart,
      title: 'Previsibilidade',
      desc: 'Saiba exatamente quanto vai receber e quando. Um dashboard claro com suas metas de views e vídeos.',
    },
    {
      Icon: Icons.CheckCircle,
      title: 'Pagamento Garantido',
      desc: 'O dinheiro do criador já está na plataforma. Cumpriu a meta? O saldo é liberado para sua carteira.',
    },
  ];

  const currentFeatures =
    activeRole === 'creator' ? creatorFeatures : clipperFeatures;

  return (
    <section id="roles" className="section">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '20px' }}>
            Feito para o Ecossistema
          </h2>
          <div className="role-switch">
            <button
              className={`role-btn ${activeRole === 'creator' ? 'active' : ''}`}
              onClick={() => setActiveRole('creator')}
            >
              Para Criadores
            </button>
            <button
              className={`role-btn ${activeRole === 'clipper' ? 'active' : ''}`}
              onClick={() => setActiveRole('clipper')}
            >
              Para Clipadores
            </button>
          </div>
        </div>

        <div className="features-grid">
          {currentFeatures.map((feature, index) => (
            <div key={index} className="feature-card">
              <div className="feature-icon">
                <feature.Icon size={28} />
              </div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-desc">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const comparisonData = [
  {
    resource: 'Taxa de Organização',
    bad: 'Paga ao ADM/Mod',
    good: 'R$ 0,00 (Isento)',
  },
  {
    resource: 'Pagamentos',
    bad: 'Manual (Um por um)',
    good: 'Automático / PIX em lote',
  },
  {
    resource: 'Transparência',
    bad: 'Planilhas confusas',
    good: 'Dashboard em Tempo Real',
  },
  {
    resource: 'Segurança',
    bad: 'Confiança verbal',
    good: 'Valor retido (Escrow)',
  },
];

const ComparisonSection = () => (
  <section className="section" style={{ background: 'var(--bg-card)' }}>
    <div className="container">
      <h2
        style={{
          textAlign: 'center',
          fontSize: '2.5rem',
          marginBottom: '50px',
        }}
      >
        A Evolução do Mercado
      </h2>

      <div className="comparison-desktop">
        <div style={{ overflowX: 'auto' }}>
          <table className="comparison-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Recurso</th>
                <th style={{ width: '35%' }} className="col-header">
                  Modelo Atual (Discord)
                </th>
                <th style={{ width: '35%' }} className="col-header brand">
                  Clipay
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((item, i) => (
                <tr key={i}>
                  <td>{item.resource}</td>
                  <td style={{ color: 'var(--danger)' }}>{item.bad}</td>
                  <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                    {item.good}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="comparison-mobile">
        {comparisonData.map((item, i) => (
          <div key={i} className="comp-card">
            <div className="comp-title">{item.resource}</div>

            <div className="comp-row">
              <div className="comp-label" style={{ color: 'var(--danger)' }}>
                <Icons.XCircle size={18} color="var(--danger)" />
                Discord
              </div>
              <div style={{ textAlign: 'right', color: '#9ca3af' }}>
                {item.bad}
              </div>
            </div>

            <div className="comp-row">
              <div className="comp-label" style={{ color: 'var(--success)' }}>
                <Icons.CheckCircle size={18} color="var(--success)" />
                Clipay
              </div>
              <div style={{ textAlign: 'right', fontWeight: 'bold' }}>
                {item.good}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Footer = () => {
  const date = new Date();
  return (
    <footer className="footer">
      <div className="container">
        <div
          className="logo"
          style={{ justifyContent: 'center', marginBottom: '20px' }}
        >
          <Icons.Play fill="var(--primary)" size={24} />
          Clipay
        </div>
        <div
          className="nav-links"
          style={{
            justifyContent: 'center',
            gap: '20px',
            marginBottom: '30px',
          }}
        >
          <a href="#" className="nav-link">
            Termos de Uso
          </a>
          <a href="#" className="nav-link">
            Política de Privacidade
          </a>
          <a href="#" className="nav-link">
            Suporte
          </a>
        </div>
        <p className="footer-text">
          &copy; {date.getFullYear()} Clipay Tecnologia. Todos os direitos
          reservados.
          <br />
          Conectando criadores e impulsionando conteúdos.
        </p>
      </div>
    </footer>
  );
};

export default function LandingPage() {
  const [activeRole, setActiveRole] = useState<Role>('creator');
  const [user, setUser] = useState<UserState | null>(null);
  const [loading, setLoading] = useState(true);

  // Efeito para verificar autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUser({
              name: data.name || 'Usuário',
              role: data.role || 'creator',
              uid: currentUser.uid
            });
          }
        } catch (error) {
          console.error("Erro ao buscar dados do usuário:", error);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="app">
      {/* Passamos o estado do usuário para o Header */}
      <Header user={user} loading={loading} />
      <Hero activeRole={activeRole} setActiveRole={setActiveRole} />
      <RolesSection activeRole={activeRole} setActiveRole={setActiveRole} />
      <ComparisonSection />

      <section className="section container" style={{ textAlign: 'center' }}>
        <div
          style={{
            background: 'var(--gradient-main)',
            padding: '60px',
            borderRadius: '20px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', zIndex: 2 }}>
            <h2
              style={{
                fontSize: '2.5rem',
                marginBottom: '20px',
                color: 'white',
              }}
            >
              Pronto para escalar?
            </h2>
            <p
              style={{
                marginBottom: '30px',
                color: 'rgba(255,255,255,0.9)',
                fontSize: '1.1rem',
              }}
            >
              Junte-se a centenas de criadores e clipadores que já estão
              profissionalizando o mercado.
            </p>
            <Link to="/signup">
              <button
                className="btn"
                style={{
                  background: 'white',
                  color: 'var(--primary)',
                  padding: '15px 40px',
                  fontSize: '1.1rem',
                }}
              >
                Criar Conta Grátis
              </button>
            </Link>
          </div>
          <div
            style={{
              position: 'absolute',
              top: '-50%',
              right: '-10%',
              width: '400px',
              height: '400px',
              background: 'white',
              opacity: '0.1',
              borderRadius: '50%',
            }}
          ></div>
        </div>
      </section>

      <Footer />
    </div>
  );
}