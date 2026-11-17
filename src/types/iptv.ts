export type BillingCycle = 'weekly' | 'monthly';
export type SubscriptionStatus = 'pending' | 'active' | 'rejected' | 'expired';
export type PaymentMethodType = 'card' | 'm10' | 'usdt';

export const ADMIN_EMAIL = 'camalmanafov022@gmail.com';

export interface PlanDefinition {
  id: 'weekly-standard' | 'weekly-pro' | 'monthly-standard' | 'monthly-vip';
  name: string;
  audience: string;
  billingCycle: BillingCycle;
  durationDays: 7 | 30;
  priceAzn: number;
  maxConnections: number;
  quality: string;
  highlights: string[];
  featured?: boolean;
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'weekly-standard',
    name: 'Həftəlik Standart',
    audience: 'Sınaq və qısa müddətli izləmə üçün',
    billingCycle: 'weekly',
    durationDays: 7,
    priceAzn: 5,
    maxConnections: 1,
    quality: 'Full HD & 4K',
    highlights: [
      '1,200+ Azərbaycan, Türkiyə və dünya kanalı',
      '1 cihaz üçün stabil Xtream Codes girişi',
      'M3U Plus və Smart TV dəstəyi',
      '7 gün fasiləsiz efir və idman kanalları',
    ],
  },
  {
    id: 'weekly-pro',
    name: 'Həftəlik Ailə Pro',
    audience: 'Həftəsonu matçları və 2 ekran üçün',
    billingCycle: 'weekly',
    durationDays: 7,
    priceAzn: 8,
    maxConnections: 2,
    quality: '4K Ultra HD',
    highlights: [
      'Eyni anda 2 fərqli cihazda izləmə',
      'beIN Sports Gold, CBC Sport və Exxen daxil',
      'Anti-Freeze sürətli server marşrutu',
      'Avtomatik Xtream Codes + Web TV pleyer',
    ],
  },
  {
    id: 'monthly-standard',
    name: 'Aylıq Standart',
    audience: 'Gündəlik ev istifadəsi üçün əsas seçim',
    billingCycle: 'monthly',
    durationDays: 30,
    priceAzn: 15,
    maxConnections: 1,
    quality: 'Full HD & 4K',
    highlights: [
      '30 gün tam kanal paketi və EPG proqram bələdçisi',
      '1 cihazda 4K və Full HD sabit yayım',
      'Bütün Smart TV, Android Box və telefon dəstəyi',
      'Avtomatik Xtream API və M3U linki',
    ],
  },
  {
    id: 'monthly-vip',
    name: 'Aylıq Ultra VIP',
    audience: 'Bütün ailə və maksimum keyfiyyət üçün',
    billingCycle: 'monthly',
    durationDays: 30,
    priceAzn: 24,
    maxConnections: 3,
    quality: '4K HDR & Anti-Freeze',
    featured: true,
    highlights: [
      'Eyni anda 3 cihazda kəsintisiz izləmə',
      'Prioritet server kanalı və 0 saniyə keçid',
      'Tam idman, kino, uşaq və sənədli arxiv',
      'Prioritet admin təsdiqi və 7/24 texniki dəstək',
    ],
  },
];

export interface ChannelItem {
  streamId: number;
  name: string;
  logo: string;
  group: string;
  categoryId: string;
  chno: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  count: number;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userPhone: string;
  planId: PlanDefinition['id'];
  planName: string;
  billingCycle: BillingCycle;
  durationDays: 7 | 30;
  priceAzn: number;
  maxConnections: number;
  status: SubscriptionStatus;
  xtreamHost: string;
  xtreamUsername: string;
  xtreamPassword: string;
  m3uUrl: string;
  paymentId: string;
  paymentMethod: PaymentMethodType;
  paymentStatus: 'paid' | 'refunded';
  adminNote?: string;
  activatedAt?: string;
  expiresAt?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  subscriptionId: string;
  planId: string;
  planName: string;
  amountAzn: number;
  method: PaymentMethodType;
  methodLabel: string;
  transactionRef: string;
  maskedDetails: string;
  status: 'paid' | 'refunded';
  createdAt: unknown;
}

export interface DispatchNotification {
  id: string;
  userId: string;
  subscriptionId: string;
  channel: 'auto_dispatch' | 'admin_approval';
  title: string;
  message: string;
  xtreamUsername: string;
  createdAt: unknown;
}
