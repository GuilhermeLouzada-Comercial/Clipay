export interface UserProfile {
    uid: string;
    name: string;
    email: string;
    role: 'admin' | 'creator' | 'clipper'; // Isso impede que você escreva 'adm' errado
    pixKey?: string; // O '?' diz que é opcional
  }
  
  export interface Campaign {
    id: string;
    title: string;
    budget: number;
    status: 'active' | 'pending_payment' | 'rejected';
  }