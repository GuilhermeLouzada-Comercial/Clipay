import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth'; // Importamos o tipo 'User'
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

// Definimos um tipo para as Roles para evitar erros de digitação (ex: 'adm' vs 'admin')
export type UserRole = 'admin' | 'creator' | 'clipper';

// Interface para as props (propriedades) do componente
interface PrivateRouteProps {
  children: React.ReactNode; // Aceita qualquer elemento React válido
  requiredRole?: UserRole;   // Opcional, mas se existir, tem que ser uma das roles acima
}

export default function PrivateRoute({ children, requiredRole }: PrivateRouteProps) {
  // Tipamos os estados explicitamente
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        try {
          // Busca o documento do usuário no Firestore para saber a Role
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            // Forçamos o tipo aqui (as UserRole) pois o Firestore retorna dados genéricos
            setRole(data?.role as UserRole);
          }
        } catch (error) {
          console.error("Erro ao buscar role do usuário:", error);
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0b0b0f', color: 'white' }}>
        Carregando...
      </div>
    );
  }

  // 1. Se não tiver usuário logado, manda pro login
  if (!user) {
    return <Navigate to="/login" />;
  }

  // 2. Se tiver uma role obrigatória e o usuário não tiver essa role, bloqueia
  if (requiredRole && role !== requiredRole) {
    // Se o usuário logado tentar acessar uma rota que não é dele, manda pra home
    return <Navigate to="/" />; 
  }

  // Se passou por tudo, mostra a página (children)
  return <>{children}</>;
}