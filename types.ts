export interface UserData {
  uid: string;
  displayName?: string;
  username?: string;
  photoURL?: string;
  isVip?: boolean;
  membership?: 'premium' | 'influencer' | 'famous' | 'none';
  role?: string;
  createdAt?: string;
  updatedAt?: string;
  isBanned?: boolean;
  isMuted?: boolean;
  lastSeen?: string;
}

export interface PrivateRoom {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerPhoto?: string;
  maxCapacity: number;
  isLocked: boolean;
  createdAt: string | number | object;
  bannedUsers?: Record<string, boolean>;
}

export interface DMConversation {
  uid: string;
  displayName?: string;
  photoURL?: string;
  lastMessage?: string;
  timestamp: number | object;
  unreadCount?: number;
  membership?: string;
  isVip?: boolean;
}
