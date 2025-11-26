import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// ... (Mantenha as funções utilitárias: getRandomInt, formatCurrency, etc...)
function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomFloat(min: number, max: number) {
  return (Math.random() * (max - min + 1) + min);
}
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
const formatCompact = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
};
const generateGrowthData = (length: number) => {
  let data: number[] = [];
  let current = 30;
  for (let i = 0; i < length; i++) {
    const change = getRandomFloat(-10, 20);
    current += change;
    if (current > 100) {
      data = data.map(element => element/current * 100);
    }
    if (current < 20) current = 20;
    data.push(current);
  }
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
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

interface HeroProps {
  activeRole: Role;
  setActiveRole: (role: Role) => void;
  theme: 'light' | 'dark'; // Adicionado prop theme
}

interface RolesSectionProps {
  activeRole: Role;
  setActiveRole: (role: Role) => void;
}

// --- COMPONENTES ---

const Header = ({ user, loading, theme, toggleTheme }: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="header">
        <div className="container nav-container" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* LOGO (Esquerda) */}
          <Link to="/" style={{ textDecoration: 'none', zIndex: 20 }}>
            <div className="logo">
              <Icons.Play fill={'url(#gradient)'} size={28} />
              <span>Clipay</span>
            </div>
          </Link>
          
          {/* NAV LINKS (Centro - Desktop) */}
          <nav className="nav-links">
            <a href="#features" className="nav-link">Funcionalidades</a>
            <a href="#roles" className="nav-link">Para Quem?</a>
            <a href="#pricing" className="nav-link">Preços</a>
          </nav>

          {/* BOTÃO CENTRALIZADO (Apenas Mobile) */}
          <div className="mobile-cta-container">
             {loading ? (
                <span style={{fontSize: '0.8rem'}}>...</span>
             ) : user ? (
                <Link to={user.role === 'creator' ? '/creator-dashboard' : '/clipper-dashboard'}>
                  <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                    Dashboard
                  </button>
                </Link>
             ) : (
                <Link to="/signup">
                  <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                    Começar Agora
                  </button>
                </Link>
             )}
          </div>

          {/* ACTIONS (Direita - Desktop) */}
          {/* Removi o style={{display: flex}} inline para o CSS controlar a visibilidade */}
          <div className="nav-buttons">
            {loading ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>...</span>
            ) : user ? (
              <>
                <span style={{ color: 'var(--text-main)', fontWeight: 500, fontSize: '0.95rem' }}>
                  Olá, {user.name.split(' ')[0]}
                </span>
                <Link to={user.role === 'creator' ? '/creator-dashboard' : user.role === 'admin' ? '/admin-dashboard' : '/clipper-dashboard'}>
                  <button className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '0.9rem' }}>
                    Dashboard <Icons.ArrowRight size={16} style={{ marginLeft: 5 }} />
                  </button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login">
                  <button className="btn btn-outline">Login</button>
                </Link>
                <Link to="/signup">
                  <button className="btn btn-primary">Começar Agora</button>
                </Link>
              </>
            )}

            {/* Theme Toggle (Desktop) */}
            <div className="theme-toggle" onClick={toggleTheme}>
              <div className="theme-toggle-bg"></div>
              <div className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}>
                <Icons.Sun size={16} />
              </div>
              <div className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}>
                <Icons.Moon size={16} />
              </div>
            </div>
          </div>

          {/* MENU ICON (Direita - Mobile) */}
          <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)}>
            <Icons.Menu size={28} />
          </button>
        </div>

        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <linearGradient id="gradient" x1="100%" y1="100%" x2="0%" y2="0%">
            <stop stopColor="#3b82f6" offset="0%" />
            <stop stopColor="#8b5cf6" offset="100%" />
          </linearGradient>
        </svg>
      </header>

      {/* MOBILE SIDEBAR */}
      <div 
        className={`mobile-sidebar-overlay ${mobileMenuOpen ? 'open' : ''}`} 
        onClick={() => setMobileMenuOpen(false)}
      />
      
      <div className={`mobile-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-sidebar-header">
          <div className="logo">
            <Icons.Play fill={'url(#gradient)'} size={24} />
            Clipay
          </div>
          <button 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Icons.X size={28} />
          </button>
        </div>

        <nav className="mobile-nav-links">
          <a href="#features" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>Funcionalidades</a>
          <a href="#roles" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>Para Quem?</a>
          <a href="#pricing" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>Preços</a>
          
          <hr style={{ borderColor: 'var(--border)', margin: '10px 0' }} />

          {user ? (
             <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>
                Logado como {user.name}
             </div>
          ) : (
            <Link to="/login" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              Fazer Login
            </Link>
          )}
        </nav>

        <div className="mobile-theme-row">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Tema</span>
          <div className="theme-toggle" onClick={toggleTheme}>
              <div className="theme-toggle-bg"></div>
              <div className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}>
                <Icons.Sun size={16} />
              </div>
              <div className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}>
                <Icons.Moon size={16} />
              </div>
            </div>
        </div>
      </div>
    </>
  );
};

// ... (Mantenha DashboardPreview igual)
const DashboardPreview = ({ role }: { role: Role }) => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const dashboardData = useMemo(() => {
    const id = getRandomInt(10000, 99999);
    const rawHeights = generateGrowthData(12);
    const bars = rawHeights.map((height) => {
      if (role === 'creator') {
        const viewCount = (height * 0.06).toFixed(1);
        return { height, tooltip: `${viewCount}M Views` };
      } else {
        return { height, tooltip: formatCurrency(height * 18) };
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
          { val: videos.toString(), label: 'Vídeos Aprovados', color: 'var(--text-main)' },
          { val: clippers.toString(), label: 'Clipadores Ativos', color: 'var(--text-main)' },
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
          { val: videos.toString(), label: 'Vídeos Postados', color: 'var(--text-main)' },
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
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{dashboardData.mainLabel}</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--text-main)' }}>{dashboardData.mainValue}</div>
        </div>
        <button className="btn btn-primary dash-action-btn" style={{ padding: '5px 15px', fontSize: '0.8rem', cursor: 'default' }}>{dashboardData.btnText}</button>
      </div>
      <div className="dash-stats">
        {dashboardData.stats.map((stat, index) => (
          <div key={index} className="stat-box">
            <div className="stat-val" style={{ color: stat.color }}>{stat.val}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>
      <div className="graph-container">
        <div className="graph-label">{dashboardData.graphLabel}</div>
        <div style={{ height: '150px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          {dashboardData.bars.map((bar, i) => (
            <div key={i} className="bar-interactive" onMouseEnter={() => setHoveredBar(i)} onMouseLeave={() => setHoveredBar(null)}
              style={{
                width: '100%', height: `${bar.height}%`, background: dashboardData.graphColor,
                opacity: 0.4 + (i / dashboardData.bars.length) * 0.6, borderRadius: '4px 4px 0 0',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)', position: 'relative', cursor: 'pointer',
              }}
            >
              {hoveredBar === i && <div className="chart-tooltip">{bar.tooltip}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- HERO COM IMAGEM DINÂMICA ---
const Hero = ({ activeRole, setActiveRole, theme }: HeroProps) => {
  // URLs das imagens
  const darkBg = "https://media.istockphoto.com/id/1405608734/vector/glowing-neon-lines-tunnel-led-arcade-stage-abstract-technology-background-virtual-reality.jpg?s=612x612&w=0&k=20&c=6qvHGCesp7DYYkYLUlBI1f_JnWQWsQDutY769MYLPu0="; 
  const lightBgSafe = "https://img.freepik.com/free-vector/blue-geometric-background_1409-961.jpg?semt=ais_hybrid&w=740&q=80";

  return (
    <section className="hero">
      <div className="hero-bg-wrapper">
        <img
          src={theme === 'light' ? lightBgSafe : darkBg}
          alt="Background"
          className="hero-bg-img"
          style={{ 
            opacity: theme === 'light' ? 0.6 : 0.15, // Aumenta opacidade no claro para ver melhor
            filter: theme === 'light' ? 'none' : 'saturate(0)', // Remove filtro P&B no claro se quiser cor
            mixBlendMode: theme === 'light' ? 'multiply' : 'screen' // Multiply mescla melhor no branco
          }} 
        />
        <div className="hero-bg-overlay" style={{
           background: theme === 'light' 
             ? 'linear-gradient(to bottom, transparent 0%, var(--bg-dark) 100%)' 
             : 'linear-gradient(to bottom, transparent 0%, var(--bg-dark) 100%)'
        }}></div>
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
            className={`btn ${activeRole === 'creator' ? 'btn-active-role' : 'btn-outline'}`}
            onClick={() => setActiveRole('creator')}
            style={{ fontWeight: 'bold', minWidth: '200px' }}
          >
            Sou Criador de Conteúdo
          </button>
          <button
            className={`btn ${activeRole === 'clipper' ? 'btn-active-role' : 'btn-outline'}`}
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
};

// ... (Mantenha RolesSection, ComparisonSection, Footer iguais)
const RolesSection = ({ activeRole, setActiveRole }: RolesSectionProps) => {
    const creatorFeatures = [
        { Icon: Icons.User, title: 'Para Criadores', desc: 'Seja você uma agência de marketing, um criador de conteúdo começando ou já bem estabelecido, a Clipay é para você, começe com qualquer valor!' },
        { Icon: Icons.BarChart3, title: 'Crescimento Orgânico', desc: 'Número de seguidores cresce organicamente com a prática da Clipay, e também é 100% legalizado nas redes sociais' },
        { Icon: Icons.ShieldCheck, title: 'Controle de Qualidade', desc: 'Você é quem define as regras para as campanhas, quem não seguir, não recebe o valor' },
    ];
    const clipperFeatures = [
        { Icon: Icons.Trophy, title: 'Escolha seu Campeonato', desc: 'Escolha a sua própria forma de remuneração! Temos campeonatos por quantidade de views e também por quantidade de vídeos postados.', },
        { Icon: Icons.LineChart, title: 'Reconhecimento', desc: 'Clipadores da plataforma são reconhecidos aqui no site e também com brindes físicos!', },
        { Icon: Icons.Wallet, title: 'Pagamento Garantido', desc: 'Saiba exatamente quando irá receber, podendo também solicitar uma antecipação!', },
    ];
    const currentFeatures = activeRole === 'creator' ? creatorFeatures : clipperFeatures;

    return (
        <section id="roles" className="section">
        <div className="container">
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '20px' }}>Feito para o Ecossistema</h2>
            <div className="role-switch">
                {/* A classe 'active' agora é controlada pelo CSS corrigido */}
                <button className={`role-btn ${activeRole === 'creator' ? 'active' : ''}`} onClick={() => setActiveRole('creator')}>Para Criadores</button>
                <button className={`role-btn ${activeRole === 'clipper' ? 'active' : ''}`} onClick={() => setActiveRole('clipper')}>Para Clipadores</button>
            </div>
            </div>
            <div className="features-grid">
            {currentFeatures.map((feature, index) => (
                <div key={index} className="feature-card">
                <div className="feature-icon"><feature.Icon size={28} /></div>
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
  { resource: 'Taxa de Organização', bad: 'Paga ao ADM/Mod', good: 'R$ 0,00 (Isento)' },
  { resource: 'Pagamentos', bad: 'Manual (Um por um)', good: 'Automático / PIX em lote' },
  { resource: 'Transparência', bad: 'Planilhas confusas', good: 'Dashboard em Tempo Real' },
  { resource: 'Segurança', bad: 'Confiança verbal', good: 'Valor retido (Escrow)' },
];

const ComparisonSection = () => (
  <section className="section" style={{ background: 'var(--bg-card)' }}>
    <div className="container">
      <h2 style={{ textAlign: 'center', fontSize: '2.5rem', marginBottom: '50px' }}>A Evolução do Mercado</h2>
      <div className="comparison-desktop">
        <div style={{ overflowX: 'auto' }}>
          <table className="comparison-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Recurso</th>
                <th style={{ width: '35%' }} className="col-header">Modelo Atual (Discord)</th>
                <th style={{ width: '35%' }} className="col-header brand">Clipay</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((item, i) => (
                <tr key={i}>
                  <td>{item.resource}</td>
                  <td style={{ color: 'var(--danger)' }}>{item.bad}</td>
                  <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>{item.good}</td>
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
              <div className="comp-label" style={{ color: 'var(--danger)' }}><Icons.XCircle size={18} color="var(--danger)" />Discord</div>
              <div style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{item.bad}</div>
            </div>
            <div className="comp-row">
              <div className="comp-label" style={{ color: 'var(--success)' }}><Icons.CheckCircle size={18} color="var(--success)" />Clipay</div>
              <div style={{ textAlign: 'right', fontWeight: 'bold' }}>{item.good}</div>
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
        <div className="logo" style={{ justifyContent: 'center', marginBottom: '20px' }}>
          <Icons.Play fill="var(--primary)" size={24} />Clipay
        </div>
        <div className="nav-links" style={{ justifyContent: 'center', gap: '20px', marginBottom: '30px' }}>
          <a href="#" className="nav-link">Termos de Uso</a>
          <a href="#" className="nav-link">Política de Privacidade</a>
          <a href="#" className="nav-link">Suporte</a>
        </div>
        <p className="footer-text">&copy; {date.getFullYear()} Clipay Tecnologia. Todos os direitos reservados.<br />Conectando criadores e impulsionando conteúdos.</p>
      </div>
    </footer>
  );
};

const FAQSection = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: "O meu dinheiro está seguro na plataforma?",
      answer: "Absolutamente. Utilizamos um sistema de 'Escrow' (Garantia). O valor pago pelo criador fica retido em uma conta segura da Clipay e só é liberado para o clipador quando o serviço é entregue e aprovado, ou conforme as regras automáticas de visualização. Isso protege ambos os lados de golpes."
    },
    {
      question: "Como funcionam os pagamentos?",
      answer: "Tudo é feito via Pix. Para criadores, geramos um QR Code único para carregar o saldo da campanha. Para clipadores, o saldo acumulado pode ser sacado diretamente para sua chave PIX cadastrada assim que atingir o valor mínimo, caindo na conta em instantes."
    },
    {
      question: "A plataforma cobra alguma taxa?",
      answer: "A plataforma é 100% gratuita tanto para clipadores, quanto para criadores de conteúdo!"
    },
    {
      question: "Como vocês sabem quantas views meu vídeo pegou?",
      answer: "Nós nos conectamos diretamente às APIs oficiais do YouTube, TikTok e Instagram. Isso garante que os dados sejam 100% precisos, sem a necessidade de enviar prints ou planilhas manuais."
    },
    {
      question: "E se o criador não aprovar meu corte?",
      answer: "Nossa plataforma possui regras claras. Se o corte cumpriu os requisitos estabelecidos na campanha (regras de edição, qualidade, etc), o pagamento é garantido. Em caso de disputas, nosso time de suporte analisa o caso para garantir justiça."
    }
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="section container">
      <div style={{ textAlign: 'center', marginBottom: '50px' }}>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '15px' }}>Perguntas Frequentes</h2>
        <p style={{ color: 'var(--text-muted)' }}>Tire suas dúvidas e entenda por que a Clipay é a escolha segura.</p>
      </div>

      <div className="faq-container">
        {faqs.map((faq, index) => (
          <div 
            key={index} 
            className={`faq-item ${openIndex === index ? 'active' : ''}`}
            onClick={() => toggleFAQ(index)}
          >
            <button className="faq-question">
              {faq.question}
              <div className="faq-icon">
                <Icons.Plus size={24} />
              </div>
            </button>
            <div className="faq-answer">
              {faq.answer}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default function LandingPage() {
  const [activeRole, setActiveRole] = useState<Role>('creator');
  const [user, setUser] = useState<UserState | null>(null);
  const [loading, setLoading] = useState(true);
  
  // TEMA PADRÃO: LIGHT
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    // Verifica auth
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUser({ name: data.name || 'Usuário', role: data.role || 'creator', uid: currentUser.uid });
          }
        } catch (error) {
          console.error("Erro ao buscar dados do usuário:", error);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // Verifica tema salvo ou define light como padrão
    const savedTheme = localStorage.getItem('clipay-theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      // Garante que o padrão seja light se não houver nada salvo
      document.documentElement.setAttribute('data-theme', 'light');
    }

    return () => unsubscribe();
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('clipay-theme', newTheme);
  };

  return (
    <div className="app">
      {/* Passamos theme e toggleTheme para o Header */}
      <Header user={user} loading={loading} theme={theme} toggleTheme={toggleTheme} />
      
      {/* Passamos theme para o Hero para trocar a imagem */}
      <Hero activeRole={activeRole} setActiveRole={setActiveRole} theme={theme} />
      
      <RolesSection activeRole={activeRole} setActiveRole={setActiveRole} />
      <ComparisonSection />
      
      <section className="section container" style={{ textAlign: 'center' }}>
        <div style={{ background: 'var(--gradient-main)', padding: '60px', borderRadius: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '20px', color: 'white' }}>Pronto para escalar?</h2>
            <p style={{ marginBottom: '30px', color: 'rgba(255,255,255,0.9)', fontSize: '1.1rem' }}>Junte-se a centenas de criadores e clipadores que já estão profissionalizando o mercado.</p>
            <Link to="/signup">
              <button className="btn" style={{ background: 'white', color: 'var(--primary)', padding: '15px 40px', fontSize: '1.1rem' }}>Criar Conta Grátis</button>
            </Link>
          </div>
          <div style={{ position: 'absolute', top: '-50%', right: '-10%', width: '400px', height: '400px', background: 'white', opacity: '0.1', borderRadius: '50%' }}></div>
        </div>
      </section>
      <FAQSection />
      <Footer />
    </div>
  );
}