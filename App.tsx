/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User, updateProfile, sendEmailVerification } from 'firebase/auth';
import { auth, db, rtdb } from './firebase';
import { doc, setDoc, onSnapshot, collection, query, where, getDocs, deleteDoc, updateDoc, getDocFromServer } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestoreUtils';
import { safePickUserData, safeJsonStringify } from './lib/serializeUtils';
import Login from './components/Login';
import ChatRoom from './components/ChatRoom';
import PrivateChat from './components/PrivateChat';
import { Crown, LayoutGrid, Users, LogOut, ChevronLeft, Sparkles, ShieldCheck, Camera, Check, Edit2, MessageSquare, Bell, Search, Mail, RefreshCw, VolumeX, Ban, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ref, update, set, serverTimestamp, onValue, onDisconnect } from 'firebase/database';
import { UserData, PrivateRoom, DMConversation } from './types';

const ADMIN_EMAIL = 'lm656508@gmail.com';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [dmInitialMessage, setDmInitialMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rooms' | 'store' | 'profile' | 'dms' | 'search'>('rooms');
  const [dmTarget, setDmTarget] = useState<UserData | null>(null);
  const [dmConversations, setDmConversations] = useState<DMConversation[]>([]);
  const [hasNewDMs, setHasNewDMs] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [previewURL, setPreviewURL] = useState('');
  const [searchUsername, setSearchUsername] = useState('');
  const [foundUser, setFoundUser] = useState<UserData | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [selectedProfile, setSelectedProfile] = useState<UserData | null>(null);
  const [adminData, setAdminData] = useState<UserData | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [fullProfileData, setFullProfileData] = useState<UserData | null>(null);
  const [famousRoom, setFamousRoom] = useState<PrivateRoom | null>(null);
  const [isManagingRoom, setIsManagingRoom] = useState(false);
  const [roomNameInput, setRoomNameInput] = useState('');

  // Google Search Tracker and URL Sanitizer to prevent blank screen crashes from query strings or tracking codes
  useEffect(() => {
    if (window.location.search || window.location.hash.includes('?')) {
      try {
        const cleanURL = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanURL);
        console.log("Cleared tracking parameters smoothly to prevent routing/blank state crashes. ✅");
      } catch (err) {
        console.error("URL tracking cleanup failed:", err);
      }
    }
  }, []);

  // Instant Admin Data Cache for search
  useEffect(() => {
    if (!user) return;
    // Optimization: Fetch the developer account specifically by its fixed ID
    const unsub = onSnapshot(doc(db, 'users', 'dev_admin_account_lm656508'), (docSnap) => {
      if (docSnap.exists()) {
        setAdminData({ ...docSnap.data(), uid: docSnap.id } as UserData);
      }
    }, () => {
      // Avoid noisy toast for background cache failures unless explicitly searching
      console.warn('Admin snapshot failed (likely permission before full auth)');
    });
    return () => unsub();
  }, [user]);

  // Instant Search Logic
  useEffect(() => {
    if (searchUsername.toLowerCase() === 'aa' || searchUsername.toLowerCase() === 'AA') {
      setFoundUser(adminData);
    } else {
      setFoundUser(null);
    }
  }, [searchUsername, adminData]);

  useEffect(() => {
    if (!user) return;
    const effectiveUid = user.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : user.uid;
    // Listen to the user's private room data from Firestore
    const roomRef = doc(db, 'private_rooms', effectiveUid);
    const unsub = onSnapshot(roomRef, (docSnap) => {
      setFamousRoom(docSnap.exists() ? docSnap.data() : null);
    }, (err) => handleFirestoreError(err, OperationType.GET, `private_rooms/${effectiveUid}`));
    return () => unsub();
  }, [user]);

  const handleCreateOrUpdateRoom = async () => {
    if (!user || !roomNameInput.trim()) return;
    const effectiveUid = user.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : user.uid;
    const roomRef = doc(db, 'private_rooms', effectiveUid);
    
    try {
      await setDoc(roomRef, {
        id: effectiveUid,
        name: roomNameInput.trim(),
        ownerId: effectiveUid,
        ownerName: userData?.displayName || 'مشهور',
        ownerPhoto: userData?.photoURL || '',
        maxCapacity: 20,
        isLocked: famousRoom?.isLocked || false,
        createdAt: Date.now()
      }, { merge: true });
      setIsManagingRoom(false);
      setToast({ message: 'تم تحديث بيانات غرفتك الخاصة بنجاح 🎪✅', type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `private_rooms/${effectiveUid}`);
      setToast({ message: 'فشل في تحديث الغرفة ⚠️', type: 'error' });
    }
  };

  const toggleRoomLock = async () => {
    if (!famousRoom) return;
    const roomRef = doc(db, 'private_rooms', famousRoom.id);
    await updateDoc(roomRef, { isLocked: !famousRoom.isLocked });
    setToast({ message: famousRoom.isLocked ? 'تم فتح الغرفة للجميع 🔓' : 'تم قفل الغرفة بنجاح 🔒', type: 'info' });
  };

  useEffect(() => {
    if (selectedProfile?.uid) {
      // Optimistic Update: Set initial profile data from what we already have
      setFullProfileData({
        ...selectedProfile,
        displayName: selectedProfile.displayName || 'عضو ملكي',
        photoURL: selectedProfile.photoURL || '',
        username: selectedProfile.username || 'user'
      });

      // التحديث اللحظي للمستخدم (Real-time Sync) عبر Firestore onSnapshot
      const path = `users/${selectedProfile.uid}`;
      const unsub = onSnapshot(doc(db, 'users', selectedProfile.uid), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFullProfileData({ ...data, uid: docSnap.id });
        } else {
          // If user doesn't exist in Firestore (rare), use what we have to stop the hang
          setFullProfileData({ 
            uid: selectedProfile.uid,
            displayName: selectedProfile.displayName || 'عضو ملكي',
            photoURL: selectedProfile.photoURL || '',
            username: selectedProfile.username || 'user'
          });
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, path);
        // On error, also stop the hang
        setFullProfileData({ 
          uid: selectedProfile.uid,
          displayName: selectedProfile.displayName || 'عضو ملكي',
          error: true
        });
      });
      return () => unsub();
    } else {
      setFullProfileData(null);
    }
  }, [selectedProfile?.uid]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    // Test Firestore connection on boot
    const testConnection = async () => {
      if (!user) return;
      const path = 'system/health';
      try {
        const snap = await getDocFromServer(doc(db, 'system', 'health')).catch(err => {
          if (err.code === 'unavailable' || err.message.includes('offline')) {
             console.warn("Firestore is currently offline or unreachable. Retrying in background...");
             return null;
          }
          handleFirestoreError(err, OperationType.GET, path);
          return null;
        });
        
        if (snap) {
          console.log("Firestore connection healthy! ✅");
        }
      } catch (err: any) {
        console.error("Firestore connection probe failed:", err?.message || String(err));
      }
    };
    testConnection();
  }, [user]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // FIXED UID FOR DEVELOPER ACCOUNT TO PREVENT DUPLICATES
        const effectiveUid = u.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : u.uid;
        setUser(u);
        
        // Sync verification status to Firestore
        const currentUserDocRef = doc(db, 'users', effectiveUid);
        const isGoogleUser = u.providerData.some(p => p.providerId === 'google.com');
        const verified = u.emailVerified || isGoogleUser || u.email === ADMIN_EMAIL;
        
        // Ensure user record exists with full fields
        const userSnap = await getDocFromServer(currentUserDocRef).catch((err) => {
          console.warn("Could not retrieve user document on boot, will try backoff creation:", err);
          return null;
        });
        
        if (!userSnap?.exists()) {
          // SYNC MIGRATION: If cloud record is missing, build it from local context
          const defaultUsername = (u.email === ADMIN_EMAIL) ? 'aa' : `u${effectiveUid.substring(0, 5)}`.toLowerCase();
          
          // Check if there's any local data to preserve
          const localCache = window.localStorage.getItem(`user_data_${effectiveUid}`);
          const parsedCache = localCache ? JSON.parse(localCache) : null;

          try {
            // PUBLIC PROFILE (No Email)
            await setDoc(currentUserDocRef, { 
              uid: effectiveUid,
              displayName: parsedCache?.displayName || (u.email === ADMIN_EMAIL ? 'دودي-Dody 👑' : (u.displayName || 'عضو ملكي')),
              username: parsedCache?.username || defaultUsername,
              isVip: u.email === ADMIN_EMAIL || parsedCache?.isVip || false,
              membership: u.email === ADMIN_EMAIL ? 'famous' : (parsedCache?.membership || 'none'),
              role: u.email === ADMIN_EMAIL ? 'famous' : (parsedCache?.role || parsedCache?.membership || 'none'),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }, { merge: true });

            // PRIVATE INFO (Contains PII)
            await setDoc(doc(db, 'users', effectiveUid, 'private', 'info'), {
              email: u.email,
              emailVerified: verified,
              lastSeen: new Date().toISOString()
            }, { merge: true });
          } catch (err) {
            console.error("Failed to self-register user document on boot:", err);
          }
          
          console.log('User synced to server for global visibility ✅');
        } else {
          try {
            // Update only fields allowed in Public
            await setDoc(currentUserDocRef, { 
              updatedAt: new Date().toISOString()
            }, { merge: true });

            // Update Private
            await setDoc(doc(db, 'users', effectiveUid, 'private', 'info'), {
              emailVerified: verified,
              lastSeen: new Date().toISOString()
            }, { merge: true });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${effectiveUid}`);
          }
        }

        // Update RTDB presence as well
        const statusRef = ref(rtdb, `users/${effectiveUid}`);
        
        // Online status
        update(statusRef, { 
          emailVerified: verified,
          status: 'online',
          lastSeen: serverTimestamp() 
        });

        // Offline status on disconnect
        onDisconnect(statusRef).update({
          status: 'offline',
          lastSeen: serverTimestamp()
        });

        // Resolve real Admin UID and Cleanup ghosts/duplicates ONLY IF AUTH AS ADMIN
        if (u.email === ADMIN_EMAIL) {
          const resolveAdmin = async () => {
            try {
              const fixedAdminUid = 'dev_admin_account_lm656508';
              window.localStorage.setItem('admin_uid_cache', fixedAdminUid);
              (window as any).OFFICIAL_ADMIN_UID = fixedAdminUid;
              
              await setDoc(doc(db, 'users', fixedAdminUid), { 
                uid: fixedAdminUid, isVip: true, membership: 'famous', role: 'famous', updatedAt: new Date().toISOString()
              }, { merge: true });

              await setDoc(doc(db, 'users', fixedAdminUid, 'private', 'info'), {
                email: ADMIN_EMAIL, emailVerified: true, lastSeen: new Date().toISOString()
              }, { merge: true });
              
              const ghostQ = query(collection(db, 'users'), where('username', 'in', ['aa', 'AA']));
              const ghostSnap = await getDocs(ghostQ);
              ghostSnap.forEach(async (d) => {
                if (d.id !== fixedAdminUid) {
                  try {
                    await deleteDoc(doc(db, 'users', d.id));
                    await set(ref(rtdb, `users/${d.id}`), null);
                  } catch { console.error("Failed to delete ghost user:", d.id); }
                }
              });

              const nameGhostQ = query(collection(db, 'users'), where('displayName', 'in', ['دودي-dody', 'دودي-Dody 👑']));
              const nameGhostSnap = await getDocs(nameGhostQ);
              nameGhostSnap.forEach(async (d) => {
                if (d.id !== fixedAdminUid) {
                  try {
                    await deleteDoc(doc(db, 'users', d.id));
                    await set(ref(rtdb, `users/${d.id}`), null);
                  } catch { /* ignore */ }
                }
              });
            } catch (e: any) {
              console.error("Admin resolution/cleanup failed", e?.message || String(e));
            }
          };
          resolveAdmin();
        }

        // INSTANT BOOT: Show UI immediately
        setLoading(false);

        return () => {};
      } else {
        setUser(null);
        setUserData(null);
        setLoading(false);
      }
    });

    // Forced Instant Boot: Never wait more than 1s for the frame
    const forceShowUITimer = setTimeout(() => setLoading(false), 1000);

    // Real-time Room Presence Listener via Firestore
    const presenceCol = collection(db, 'rooms_presence');
    const unsubPresence = onSnapshot(presenceCol, (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const uids = Object.keys(data).filter(k => k !== 'timestamp' && k !== 'createdAt');
        counts[docSnap.id] = uids.length;
      });
      setRoomCounts(counts);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'rooms_presence'));

    return () => {
      unsubAuth();
      unsubPresence();
      clearTimeout(forceShowUITimer);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    
      // Live RTDB Profile Sync
      const effectiveUid = user.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : user.uid;
      const userStatusRef = ref(rtdb, `users/${effectiveUid}`);
      const unsubRTDB = onValue(userStatusRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          // Use safer object creation to avoid potential cyclic structures from SDK objects
          const cleanData = { ...data };
          setUserData((prev: any) => ({ ...prev, ...cleanData }));
          
          if (data.isBanned) {
            auth.signOut();
          }
        }
      });

      const unsubUserData = onSnapshot(doc(db, 'users', effectiveUid), async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const cleanData = { ...data };
          setUserData((prev: any) => ({ ...prev, ...cleanData }));
        
        // Sync name restrictions
        const lowerName = (data.displayName || '').toLowerCase();
        if ((lowerName.includes('دودي') || lowerName.includes('dody')) && user.email !== ADMIN_EMAIL) {
           updateProfile(user, { displayName: `عضو_${Math.floor(Math.random()*1000)}` });
           setDoc(doc(db, 'users', effectiveUid), { displayName: `عضو الملكي` }, { merge: true });
        }
        
        // Ensure username exists (for old accounts)
        if (!data.username) {
          const isDev = user.email === ADMIN_EMAIL;
          const fallbackUsername = isDev ? 'aa' : `u${effectiveUid.substring(0, 5)}`.toLowerCase();
          setDoc(doc(db, 'users', effectiveUid), { username: fallbackUsername }, { merge: true });
        }

          // Forced developer recognition - check email strictly
          if (user.email === ADMIN_EMAIL) {
            if (!data.isVip || !data.membership) {
              (async () => {
                const { update, ref: dbRef } = await import('firebase/database');
                const { rtdb } = await import('./firebase');
                await setDoc(doc(db, 'users', effectiveUid), {
                  isVip: true,
                  membership: 'famous',
                  updatedAt: new Date().toISOString()
                }, { merge: true });
                await update(dbRef(rtdb, `users/${effectiveUid}`), {
                  isVip: true,
                  membership: 'famous'
                });
              })();
            }
          }

        if (data.isBanned) {
          auth.signOut();
        }
      } else {
         // Auto-create ANY user doc if missing
         const fallbackUsername = user.email === ADMIN_EMAIL ? 'aa' : `u${effectiveUid.substring(0, 5)}`.toLowerCase();
         // Public profile
         await setDoc(doc(db, 'users', effectiveUid), {
           displayName: user.displayName || 'عضو ملكي',
           username: fallbackUsername,
           isVip: user.email === ADMIN_EMAIL,
           membership: user.email === ADMIN_EMAIL ? 'famous' : 'none',
           createdAt: new Date().toISOString()
         }, { merge: true });
         // Private profile
         await setDoc(doc(db, 'users', effectiveUid, 'private', 'info'), {
           email: user.email,
           emailVerified: true,
           lastSeen: new Date().toISOString()
         }, { merge: true });
      }
      setLoading(false);
    }, (error) => {
      console.error("Firestore onSnapshot error:", error?.message || String(error));
      setLoading(false);
    });

    return () => {
      unsubRTDB();
      unsubUserData();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Listen for DM conversations
    const effectiveUid = user.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : user.uid;
    const dmsRef = ref(rtdb, `user_dms/${effectiveUid}`);
    const unsubDMs = onValue(dmsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.values(data).sort((a: any, b: any) => ((b as any).timestamp || 0) - ((a as any).timestamp || 0)) as DMConversation[];
        setDmConversations(list);
        
        // Sum unread counts for badge
        const totalUnread = list.reduce((acc: number, curr: DMConversation) => acc + (curr.unreadCount || 0), 0);
        
        if (totalUnread > unreadCount && user?.email === ADMIN_EMAIL) {
          const latestConv = [...list].sort((a: any, b: any) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))[0];
          if (latestConv && latestConv.unreadCount && latestConv.unreadCount > 0 && latestConv.lastMessage?.includes('أرغب في شراء')) {
            setToast({ message: `لديك طلب شراء جديد من ${latestConv.displayName}! 👑`, type: 'info' });
            // Browser notification fallback if supported
            if (Notification.permission === 'granted') {
               new Notification('طلب شراء جديد', { body: `المستخدم ${latestConv.displayName} يرغب في شراء عضوية.` });
            }
          }
        }

        setUnreadCount(totalUnread);
        setHasNewDMs(totalUnread > 0);
      } else {
        setDmConversations([]);
        setUnreadCount(0);
        setHasNewDMs(false);
      }
    });

    return () => unsubDMs();
  }, [user]);

  // Global unread listener
  useEffect(() => {
    if (!user) return;
    
    // Listen to meta node for unreads if we were to restructure, 
    // but for now let's just listen to the whole user_dms node for changes
    // or better, a dedicated unread_count node.
    // Let's stick to the prompt's request for basic notification.
  }, [user]);

  const roomsList = [
    { id: 'public', name: 'العامة', icon: '🌍', desc: 'مجلس يجمع الجميع للنقاش والحوار الراقي' },
    { id: 'iraq', name: 'العراق', icon: '🇮🇶', desc: 'دردشة مخصصة لأهل العراق الكرام' },
    { id: 'saudi', name: 'السعودية', icon: '🇸🇦', desc: 'مجلس أهل المملكة العربية السعودية' },
    { id: 'lebanon', name: 'لبنان', icon: '🇱🇧', desc: 'دردشة الأشقاء في لبنان الجميل' },
    { id: 'kuwait', name: 'الكويت', icon: '🇰🇼', desc: 'ديوانية أهل الكويت الأعزاء' },
    { id: 'egypt', name: 'مصر', icon: '🇪🇬', desc: 'بيت أهل مصر الكرام واللقاءات الودية' }
  ];

  const [privateRooms, setPrivateRooms] = useState<any[]>([]);
  useEffect(() => {
    const pRoomsCol = collection(db, 'private_rooms');
    const unsub = onSnapshot(pRoomsCol, (snapshot) => {
      const roomsArray: any[] = [];
      snapshot.forEach((docSnap) => {
        const val = docSnap.data();
        roomsArray.push({
          ...val,
          id: val.id || docSnap.id
        });
      });
      setPrivateRooms(roomsArray);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'private_rooms'));
    return () => unsub();
  }, []);

  const handleEnterRoom = async (roomId: string) => {
    const isPrivate = privateRooms.find(r => r.id === roomId);
    if (isPrivate) {
      const currentCount = roomCounts[roomId] || 0;
      if (isPrivate.isLocked && isPrivate.ownerId !== (user?.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : user?.uid)) {
        setToast({ message: 'هذه الغرفة مقفلة حالياً من قبل المشهور 🔒', type: 'error' });
        return;
      }
      if (currentCount >= (isPrivate.maxCapacity || 20) && isPrivate.ownerId !== (user?.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : user?.uid)) {
        setToast({ message: 'الغرفة ممتلئة (الحد الأقصى 20 شخصاً) ⚠️', type: 'error' });
        return;
      }
      // Check if banned from synced in-memory document data
      const myUid = user?.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : user?.uid;
      if (isPrivate.bannedUsers && isPrivate.bannedUsers[myUid]) {
        setToast({ message: 'أنت محظور من دخول هذه الغرفة من قبل المشهور 🚫', type: 'error' });
        return;
      }
      setActiveRoom(roomId);
    } else {
      setActiveRoom(roomId);
    }
  };

  const memberships = [
    { 
      id: 'premium', 
      name: 'عضوية المميز', 
      price: '4.99$', 
      features: ['لون نص الرسالة جوزي', 'هاشتاغ #المميز'],
      color: 'from-orange-800 to-orange-950',
      tag: 'شراء دائم'
    },
    { 
      id: 'influencer', 
      name: 'عضوية المؤثر', 
      price: '9.99$', 
      features: ['لون نص الرسالة أخضر', 'هاشتاغ #المؤثر'],
      color: 'from-green-600 to-emerald-900',
      tag: 'شراء دائم'
    },
    { 
      id: 'famous', 
      name: 'عضوية المشهور', 
      price: '29.99$', 
      features: ['لون نص أحمر متوهج', 'هاشتاغ #المشهور', 'إنشاء غرفة خاصة لـ 20 شخصاً'],
      color: 'from-red-600 to-rose-900',
      tag: 'شراء دائم'
    }
  ];

  const handleOrder = async (m: any) => {
    if (!user) return;
    
    // Check if the user is the Admin (Developer)
    if (user.email === ADMIN_EMAIL) {
      try {
        const fixedUid = 'dev_admin_account_lm656508';
        const currentUid = user.uid;
        
        // Immediate activation for the developer - update both the fixed ID and the active session ID
        const updates = [
          setDoc(doc(db, 'users', fixedUid), {
            isVip: true,
            membership: m.id,
            role: m.id, // Explicitly set role as requested
            updatedAt: new Date().toISOString()
          }, { merge: true }),
          update(ref(rtdb, `users/${fixedUid}`), {
            isVip: true,
            membership: m.id,
            role: m.id
          })
        ];

        if (currentUid !== fixedUid) {
          updates.push(
            setDoc(doc(db, 'users', currentUid), {
              isVip: true,
              membership: m.id,
              role: m.id,
              updatedAt: new Date().toISOString()
            }, { merge: true }),
            update(ref(rtdb, `users/${currentUid}`), {
              isVip: true,
              membership: m.id,
              role: m.id
            })
          );
        }
        
        await Promise.all(updates);
        
        // Instant local feedback
        setUserData((prev: any) => ({ ...prev, isVip: true, membership: m.id, role: m.id }));
        setToast({ message: `تم تفعيل رتبة ${m.name} للمطور بنجاح! 👑✨`, type: 'success' });
        return;
      } catch (e: any) {
        console.error("Admin activation error:", e);
        setToast({ message: 'فشل التفعيل التلقائي للمطور', type: 'error' });
        return;
      }
    }

    // Normal User Flow: Open DM with developer
    const developerAccount = {
      uid: 'dev_admin_account_lm656508',
      displayName: 'دودي-Dody 👑',
      username: 'aa',
      photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=Dody`,
      email: ADMIN_EMAIL
    };

    const orderCode = Math.floor(10000 + Math.random() * 90000).toString();
    const orderText = `طلب شراء: ${m.name} | رمز الطلب: ${orderCode}`;
    
    // Set initial message and target to open the chat immediately
    setDmInitialMessage(orderText);
    setDmTarget(developerAccount);
    
    setToast({ message: 'جاري فتح المحادثة المباشرة مع المطور... ✨', type: 'info' });
  };

  const compressImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 150;
          const MAX_HEIGHT = 150;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Use very low quality (0.4) for maximum speed/storage efficiency
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.4);
          resolve(compressedBase64);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleInstantImageUpload = async (file: File) => {
    if (!user) return;
    const effectiveUid = user.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : user.uid;
    
    setIsUploadingImage(true);
    setToast({ message: 'جاري تطبيق سحر دودي على الصورة... ✨', type: 'info' });

    try {
      // 1. Convert and compress immediately on client
      const base64Image = await compressImageToBase64(file);

      // 2. Update local state and cache IMMEDIATELY (Optimistic)
      const updatedData = { ...userData, photoURL: base64Image };
      setUserData(updatedData);
      
      // Defensively pick only serializable fields to prevent cyclic structure errors
      const cacheData = safePickUserData(updatedData);
      window.localStorage.setItem(`user_data_${effectiveUid}`, safeJsonStringify(cacheData));
      
      setPreviewURL(base64Image);
      setIsUploadingImage(false); // User can now do other things

      // 3. Update databases in background
      Promise.all([
        (async () => {
          try {
            await setDoc(doc(db, 'users', effectiveUid), {
              photoURL: base64Image,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${effectiveUid}`);
          }
        })(),
        update(ref(rtdb, `users/${effectiveUid}`), { photoURL: base64Image })
      ]).then(() => {
        setToast({ message: 'تم حفظ الصورة بنجاح ملكي! 👑✅', type: 'success' });
      }).catch(err => {
        console.error("BG Image sync error:", err);
        setToast({ message: 'فشل مزامنة الصورة مع السيرفر ⚠️', type: 'error' });
      });

    } catch (err: any) {
      console.error("Image processing error:", err?.message || String(err));
      setIsUploadingImage(false);
      setToast({ message: 'فشل معالجة الصورة، جرب أخرى ❌', type: 'error' });
    }
  };

  const handleSaveProfile = async () => {
    if (!user || isSaving) return;
    
    setIsSaving(true);
    setToast({ message: 'جاري حفظ بياناتك الملكية... ✨', type: 'info' });

    try {
      // Identity Protection: Prevent Impersonation
      const isOwner = user.email === ADMIN_EMAIL;
      const lowerDisplayName = (newDisplayName || user.displayName || '').toLowerCase();
      const lowerUsername = (newUsername || userData?.username || '').toLowerCase();

      const isReservedName = lowerDisplayName.includes('دودي') || lowerDisplayName.includes('dody');
      const isReservedUser = lowerUsername === 'aa';

      if (!isOwner && (isReservedName || isReservedUser)) {
        setToast({ message: 'عذراً، هذا الاسم أو اليوزر محجوز للمطور الرسمي (دودي) فقط 👑⚠️', type: 'error' });
        setIsSaving(false);
        return;
      }

      const effectiveUid = user.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : user.uid;
      const cleanedDisplayName = isReservedName && !isOwner 
        ? (newDisplayName || user.displayName || '').replace(/دودي|Dody|DODY|👑/gi, '').trim() || 'عضو ملكي'
        : (newDisplayName || user.displayName || 'عضو ملكي');

      const cleanedUsername = isReservedUser && !isOwner
        ? 'user_' + Math.floor(1000 + Math.random() * 9000)
        : (newUsername || userData?.username || `u${effectiveUid.substring(0, 5)}`).toLowerCase();

      // Check if username is already taken by someone else (Fast check)
      if (cleanedUsername !== userData?.username) {
        const q = query(collection(db, 'users'), where('username', '==', cleanedUsername));
        const path = 'users';
        try {
          const snap = await getDocs(q);
          if (!snap.empty) {
            setToast({ message: 'هذا اليوزر مستخدم بالفعل، اختر يوزر آخر ⚠️', type: 'error' });
            setIsSaving(false);
            return;
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, path);
        }
      }
      
      // 1. Optimistic Feedback
      const updatedData = { ...userData, displayName: cleanedDisplayName, username: cleanedUsername };
      setUserData(updatedData);
      
      // Defensively pick only serializable fields to prevent cyclic structure errors
      const cacheData = safePickUserData(updatedData);
      window.localStorage.setItem(`user_data_${effectiveUid}`, safeJsonStringify(cacheData));
      
      setUser(prev => prev ? ({ ...prev, displayName: cleanedDisplayName }) : null);

      // 2. Clear UI immediately (Optimistic)
      setToast({ message: 'تم حفظ التعديلات بنجاح ملكي ✅', type: 'success' });
      setIsEditingProfile(false);
      setIsSaving(false);

      // 3. Perform database updates in background
      const path = `users/${effectiveUid}`;
      Promise.all([
        // Firestore - Source of Truth 1
        (async () => {
          try {
            await setDoc(doc(db, 'users', effectiveUid), {
              displayName: cleanedDisplayName,
              username: cleanedUsername,
              photoURL: userData?.photoURL || '',
              updatedAt: new Date().toISOString()
            }, { merge: true });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, path);
          }
        })(),

        // Auth Profile
        updateProfile(auth.currentUser!, { 
          displayName: cleanedDisplayName 
        }),

        // RTDB Profile - Source of Truth 2 (Immediate sync for rooms)
        update(ref(rtdb, `users/${effectiveUid}`), {
          displayName: cleanedDisplayName,
          username: cleanedUsername,
          photoURL: userData?.photoURL || '',
          lastSeen: Date.now()
        })
      ]).catch(e => {
        console.error("BG Profile update error:", e?.message || String(e));
        setToast({ message: 'فشل مزامنة التعديلات مع السيرفر ⚠️', type: 'error' });
      });

    } catch (e: any) {
      console.error("Profile update error:", e?.message || String(e));
      setToast({ message: 'عذراً، فشل المزامنة. تحقق من اتصالك ⚠️', type: 'error' });
      setIsSaving(false);
    }
  };

  const handleSearchUser = () => {
    setIsSearching(true);
    setTimeout(() => {
      setIsSearching(false);
      if (searchUsername.toLowerCase() === 'aa' || searchUsername.toLowerCase() === 'AA') {
        if (adminData) {
          setFoundUser(adminData);
        } else {
          setToast({ message: 'حساب المطور غير متاح في الذاكرة حالياً، انتظر لحظة ✨', type: 'error' });
        }
      } else if (searchUsername.length >= 2) {
        setToast({ message: 'البحث متاح فقط عن المطور الرسمي حالياً 👑', type: 'info' });
        setFoundUser(null);
      }
    }, 400);
  };

  const grantFoundUserMembership = async (type: 'premium' | 'influencer' | 'famous') => {
    if (!foundUser) return;
    try {
      await setDoc(doc(db, 'users', foundUser.uid), {
        isVip: true,
        membership: type,
        role: type,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await update(ref(rtdb, `users/${foundUser.uid}`), {
        isVip: true,
        membership: type,
        role: type
      });

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      setFoundUser({ ...foundUser, isVip: true, membership: type, role: type });
      setToast({ message: 'تم تحديث الرتبة بنجاح ✅', type: 'success' });
    } catch (e: any) {
      console.error("Grant membership error:", e?.message || String(e));
      alert('فشل في منح العضوية');
    }
  };

  if (loading) {
    return (
      <div className="h-[100dvh] bg-[#05070a] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="relative w-24 h-24"
        >
          <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-[2rem]" />
          <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-[2rem]" />
          <Crown className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-indigo-400" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Verification Gate: Check if user is verified
  const isGoogleUser = user.providerData.some(p => p.providerId === 'google.com');
  const isVerified = user.emailVerified || isGoogleUser || user.email === ADMIN_EMAIL;

  if (!isVerified) {
    return (
      <div className="h-[100dvh] bg-[#05070a] flex flex-col items-center justify-center p-6 text-white text-center font-arabic" dir="rtl">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-red-600/10 rounded-full blur-[120px] -z-0 pointer-events-none" />
        
        <div className="w-24 h-24 bg-red-600/20 rounded-[2rem] flex items-center justify-center mb-8 border border-red-500/30">
          <Mail className="w-12 h-12 text-red-500" />
        </div>

        <h1 className="text-3xl font-black mb-4">يرجى توثيق بريدك الإلكتروني 🔐</h1>
        <p className="text-gray-400 text-sm mb-10 max-w-sm leading-relaxed">
          لقد أرسلنا رابط تفعيل إلى <span className="text-white font-bold">{user.email}</span>. 
          يرجى الضغط على الرابط في بريدك لتتمكن من دخول غرف الدردشة واستخدام المتجر الملكي.
        </p>

        <div className="w-full max-w-xs space-y-4">
          <button 
            disabled={resendingEmail}
            onClick={async () => {
              setResendingEmail(true);
              try {
                await sendEmailVerification(user);
                setToast({ message: 'تم إرسال رابط التفعيل مرة أخرى ✅', type: 'success' });
              } catch {
                setToast({ message: 'فشل الإرسال، حاول لاحقاً ⚠️', type: 'error' });
              } finally {
                setResendingEmail(false);
              }
            }}
            className="w-full bg-white text-gray-900 py-5 rounded-2xl font-black text-sm flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
          >
            {resendingEmail ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>إعادة إرسال الرابط</span>
          </button>

          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-[#161b33] text-white py-5 rounded-2xl font-black text-sm border border-white/5 active:scale-95 transition-all"
          >
            لقد قمت بالتفعيل، حدث الصفحة
          </button>

          <button 
            onClick={() => auth.signOut()}
            className="w-full text-red-500 text-xs font-bold pt-4 underline"
          >
            تسجيل خروج
          </button>
        </div>

        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-10 left-4 right-4 z-[100] flex justify-center"
            >
              <div className={`${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3`}>
                <span className="text-xs font-black">{toast.message}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const isAdmin = user?.email === ADMIN_EMAIL;

  const openPrivateChat = (target: UserData) => {
    if (!user) return;
    // الاستجابة الفورية: فتح واجهة المحادثة فوراً دون أي انتظار
    setDmTarget(target);
    setDmInitialMessage("");
  };

  const toggleMuteUser = async (targetUid: string, currentStatus: boolean) => {
    if (!isAdmin) return;
    const path = `users/${targetUid}`;
    try {
      const newStatus = !currentStatus;
      await Promise.all([
        (async () => {
          try {
            await setDoc(doc(db, 'users', targetUid), { isMuted: newStatus }, { merge: true });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, path);
          }
        })(),
        update(ref(rtdb, `users/${targetUid}`), { isMuted: newStatus })
      ]);
      setToast({ message: `تم ${newStatus ? 'كتم' : 'إلغاء كتم'} المستخدم بنجاح ✅`, type: 'success' });
    } catch {
      setToast({ message: 'فشل تنفيذ الأمر ⚠️', type: 'error' });
    }
  };

  const kickUser = async (targetUid: string) => {
    if (!isAdmin || !confirm('هل أنت متأكد من طرد هذا المستخدم نهائياً؟')) return;
    const path = `users/${targetUid}`;
    try {
      await Promise.all([
        (async () => {
          try {
            await setDoc(doc(db, 'users', targetUid), { isBanned: true }, { merge: true });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, path);
          }
        })(),
        update(ref(rtdb, `users/${targetUid}`), { isBanned: true })
      ]);
      setToast({ message: 'تم طرد المستخدم بنجاع ✅', type: 'success' });
      setSelectedProfile(null);
    } catch {
      setToast({ message: 'فشل الطرد ⚠️', type: 'error' });
    }
  };

  const handleAdminDeleteRoom = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) return;
    
    // Immediate action as requested by user
    try {
      const roomRef = ref(rtdb, `private_rooms/${roomId}`);
      // Remove the room and also potentially clean up messages
      await set(roomRef, null);
      
      // Also clean up messages for that room to be thorough
      const messagesRef = ref(rtdb, `rooms/${roomId}`);
      await set(messagesRef, null);

      setToast({ message: 'تم حذف الغرفة وتطهير البيانات بنجاح 🗑️✅', type: 'success' });
    } catch (err: unknown) {
      console.error("Delete room error:", err);
      const errorMessage = err instanceof Error ? err.message : 'خطأ غير معروف';
      setToast({ message: 'فشل حذف الغرفة: ' + errorMessage, type: 'error' });
    }
  };

  const grantRankGlobal = async (targetUid: string, type: 'premium' | 'influencer' | 'famous' | null) => {
    if (!isAdmin) return;
    try {
      await Promise.all([
        setDoc(doc(db, 'users', targetUid), { isVip: type !== null, membership: type, role: type }, { merge: true }),
        update(ref(rtdb, `users/${targetUid}`), { isVip: type !== null, membership: type, role: type })
      ]);
      setToast({ message: 'تم تحديث الرتبة بنجاح ✅', type: 'success' });
    } catch {
      setToast({ message: 'فشل الترقية ⚠️', type: 'error' });
    }
  };

  return (
    <div className="h-[100dvh] bg-[#05070a] text-white flex flex-col font-arabic overflow-hidden" dir="rtl">
      {/* Immersive Background */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-[140px] -z-0 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] -z-0 pointer-events-none" />
      
      <header className="p-6 flex justify-between items-center relative z-10 max-w-2xl mx-auto w-full">
        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="fixed top-6 left-4 right-4 z-[100] flex justify-center pointer-events-none"
            >
              <div className="bg-orange-600 text-white px-6 py-4 rounded-[1.5rem] shadow-2xl border border-white/20 flex items-center gap-3 pointer-events-auto backdrop-blur-xl">
                <Bell className="w-5 h-5 animate-bounce" />
                <span className="text-sm font-black">{toast.message}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black gold-gradient-text"><span>دودي رويال</span></h1>
            {isAdmin && (
              <div className="bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Crown className="w-2.5 h-2.5 text-amber-500" />
                <span className="text-[8px] text-amber-500 font-black"><span>إدارة المطور</span></span>
              </div>
            )}
          </div>
          <p className="text-gray-500 text-xs font-bold"><span>بواسطة المطور دودي-Dody 👑</span></p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src={userData?.photoURL || user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || 'User'}`} 
              className="w-10 h-10 rounded-xl border border-white/10" 
              alt="me" 
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#05070a] rounded-full" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-24 relative z-10 max-w-2xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'rooms' && (
            <motion.div 
              key="rooms"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 mb-4">
                <LayoutGrid className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">الغرف الملكية المتاحة</h2>
              </div>
              
              {roomsList.map((r, idx) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => handleEnterRoom(r.id)}
                  className="group relative flex items-center gap-4 p-4 bg-[#0a0f18]/60 backdrop-blur-xl rounded-2xl cursor-pointer hover:bg-[#111827]/80 transition-all border border-white/5 overflow-hidden"
                >
                  <div className="w-10 h-10 rounded-full bg-[#05070a] border border-white/10 flex items-center justify-center text-xl shrink-0">
                    {r.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-white group-hover:text-indigo-400 transition-colors truncate"><span>غرفة {r.name}</span></h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Users className="w-3 h-3 text-indigo-400/60" />
                      <span className="text-[10px] font-black text-indigo-400/80">الأعضاء: {roomCounts[r.id] || 0}</span>
                    </div>
                  </div>

                  <ChevronLeft className="w-4 h-4 text-gray-700 rotate-180 group-hover:text-indigo-400 transition-colors" />
                </motion.div>
              ))}

              {privateRooms.length > 0 && (
                <div className="mt-8 space-y-3">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">غرف المشاهير الخاصة</h2>
                  </div>
                  {privateRooms.map((r, idx) => (
                     <motion.div
                      key={r.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      onClick={() => handleEnterRoom(r.id)}
                      className="group relative flex items-center gap-4 p-5 bg-gradient-to-r from-amber-500/10 to-transparent backdrop-blur-xl rounded-[2rem] cursor-pointer hover:bg-amber-500/20 transition-all border border-amber-500/20 overflow-hidden"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-[#05070a] border border-amber-500/30 flex items-center justify-center shrink-0 shadow-lg relative">
                        <img 
                          src={r.ownerPhoto || `https://api.dicebear.com/7.x/initials/svg?seed=${r.ownerName}`} 
                          className="w-full h-full rounded-2xl object-cover opacity-60" 
                          alt="owner"
                        />
                        <Crown className="absolute -top-2 -right-2 w-5 h-5 text-amber-500 fill-amber-500" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-sm text-amber-500 group-hover:text-amber-400 transition-colors truncate"><span>غرفة {r.name}</span></h3>
                          {r.isLocked && <ShieldCheck className="w-3 h-3 text-red-500" />}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1">
                            <Users className="w-2.5 h-2.5 text-gray-500" />
                            <span className="text-[9px] font-black text-gray-500">الحضور: {roomCounts[r.id] || 0}/20</span>
                          </div>
                          <span className="text-[8px] text-amber-500/60 font-bold">بواسطة: {r.ownerName}</span>
                        </div>
                      </div>

                      <div className="bg-amber-500/20 px-3 py-1.5 rounded-full text-[9px] font-black text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all">
                        دخول
                      </div>
                      
                      {isAdmin && (
                        <button 
                          type="button"
                          onClick={(e) => {
                            console.log("Admin click delete for room:", r.id);
                            handleAdminDeleteRoom(r.id, e);
                          }}
                          title="حذف الغرفة نهائياً"
                          className="p-3 bg-red-500/20 hover:bg-red-500 hover:text-white text-red-500 rounded-2xl transition-all active:scale-95 relative z-50 mr-2 flex items-center justify-center shadow-lg"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'store' && (
            <motion.div 
              key="store"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center py-4 px-6 bg-indigo-600/10 border border-indigo-500/20 rounded-3xl">
                <h2 className="text-xl font-black gold-gradient-text mb-2">المتجر الملكي</h2>
                <p className="text-gray-500 text-[11px] text-indigo-300 font-bold leading-relaxed">
                  💡 ملاحظة: بعد الضغط على الطلب، سيتم توجيهك للمطور دودي-Dody للاتفاق على طريقة الدفع وتفعيل العضوية لك يدوياً.
                </p>
              </div>

              <div className="space-y-4">
                {memberships.map((m, idx) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`bg-gradient-to-br ${m.color} p-6 rounded-[2rem] shadow-xl relative overflow-hidden group border border-white/10`}
                  >
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="mb-4">
                        <h3 className="text-xl font-black text-white mb-1 uppercase tracking-wider"><span>{m.name}</span></h3>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-black text-white"><span>{m.price}</span></span>
                          <span className="text-[10px] text-white/60 font-bold uppercase"><span>مدى الحياة</span></span>
                        </div>
                      </div>

                      <div className="w-full h-px bg-white/10 mb-5" />

                      <ul className="space-y-3 mb-8">
                        {m.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-3 text-xs text-white/90 font-bold text-right w-full" dir="rtl">
                            <div className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                            <span><span>{f}</span></span>
                          </li>
                        ))}
                      </ul>

                      <button 
                        onClick={() => handleOrder(m)}
                        className="mt-auto w-full bg-white text-[#05070a] py-4 rounded-2xl font-black text-sm shadow-2xl active:scale-95 transition-all hover:bg-gray-100 uppercase tracking-wide"
                      >
                        {user.email === ADMIN_EMAIL ? 'تفعيل فوري للمطور' : 'اطلب الآن'}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'search' && (
            <motion.div 
              key="search"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">تحدث معا مطور البرنامج</h2>
              </div>

              <div className="bg-[#0a0f18]/60 p-6 rounded-[2rem] border border-white/5 backdrop-blur-xl">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="text"
                      value={searchUsername}
                      onChange={(e) => setSearchUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                      placeholder="يوزر المطور AA"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
                      className="w-full bg-[#05070a] border border-white/5 rounded-2xl py-4 pr-10 pl-4 text-sm outline-none focus:border-indigo-500 transition-colors font-mono"
                    />
                  </div>
                  <button 
                    onClick={handleSearchUser}
                    disabled={searchUsername.length < 2 || isSearching}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white px-6 rounded-2xl font-black text-sm transition-all active:scale-95"
                  >
                    {isSearching ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'بحث'}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {foundUser && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-6 bg-[#0a0f18]/80 border ${foundUser.email === ADMIN_EMAIL ? 'border-amber-500/30 ring-1 ring-amber-500/20' : 'border-white/10'} rounded-[2.5rem] flex flex-col items-center text-center shadow-2xl relative overflow-hidden`}
                  >
                    <div className={`absolute top-0 right-0 w-32 h-32 ${foundUser.email === ADMIN_EMAIL ? 'bg-amber-500/10' : 'bg-indigo-600/10'} rounded-full blur-[40px] -z-10`} />
                    
                    <div className="relative mb-4 cursor-pointer active:scale-95 transition-transform" onClick={() => setSelectedProfile({ 
                      uid: foundUser.uid, 
                      displayName: foundUser.displayName, 
                      photoURL: foundUser.photoURL 
                    })}>
                      <img 
                        src={foundUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${foundUser.displayName}`} 
                        className={`w-24 h-24 rounded-[2rem] border-4 ${foundUser.email === ADMIN_EMAIL ? 'border-amber-500/30 scale-105' : 'border-[#05070a]'} shadow-xl transition-all`}
                        alt="found profile"
                      />
                      {(foundUser.isVip || foundUser.email === ADMIN_EMAIL) && (
                        <div className={`absolute -top-2 -right-2 w-8 h-8 ${foundUser.email === ADMIN_EMAIL ? 'bg-amber-500' : 'bg-indigo-600'} rounded-full flex items-center justify-center border-4 border-[#0a0f18]`}>
                          <Crown className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mb-1 cursor-pointer hover:text-indigo-400 transition-colors" onClick={() => setSelectedProfile({ 
                      uid: foundUser.uid,
                      displayName: foundUser.displayName,
                      photoURL: foundUser.photoURL
                    })}>
                      <h3 className="text-xl font-black">{foundUser.displayName}</h3>
                      {foundUser.email === ADMIN_EMAIL && <ShieldCheck className="w-5 h-5 text-amber-500" />}
                    </div>

                    <div className={`${foundUser.email === ADMIN_EMAIL ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' : 'text-indigo-400 bg-indigo-400/10 border-indigo-500/20'} text-[10px] font-black tracking-widest px-3 py-1 rounded-full border mb-2 uppercase`}>
                      @{foundUser.username}
                    </div>

                    <div className="text-[9px] text-gray-500 font-bold mb-4 uppercase tracking-tighter">
                      الرتبة: <span className={foundUser.isVip ? 'text-amber-400' : 'text-indigo-300'}>
                        {foundUser.email === ADMIN_EMAIL ? 'المطور 👑' : (foundUser.isVip ? foundUser.membership.toUpperCase() : 'عضو موثق')}
                      </span>
                    </div>

                    {foundUser.email === ADMIN_EMAIL && (
                      <div className="mb-4 py-1 px-3 bg-amber-500/20 border border-amber-500/20 rounded-lg">
                        <span className="text-[10px] text-amber-500 font-black">حساب حقيقي وموثق 👑</span>
                      </div>
                    )}

                    <div className="w-full h-px bg-white/5 mb-4" />

                    <div className="flex gap-2 w-full">
                      <button 
                        onClick={() => {
                          openPrivateChat(foundUser);
                          setActiveTab('dms');
                        }}
                        className="flex-1 bg-white text-gray-900 py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
                      >
                        <MessageSquare className="w-4 h-4" />
                        راسله الآن
                      </button>
                      <button 
                        onClick={() => setSelectedProfile({ 
                          uid: foundUser.uid,
                          displayName: foundUser.displayName,
                          photoURL: foundUser.photoURL
                        })}
                        className="flex-1 bg-white/5 text-gray-400 py-3 rounded-xl font-black text-xs active:scale-95 transition-all"
                      >
                        عرض التفاصيل
                      </button>
                    </div>

                    {isAdmin && foundUser.email !== ADMIN_EMAIL && (
                      <div className="w-full mt-4 pt-4 border-t border-white/5">
                        <div className="text-[9px] text-gray-500 font-bold mb-3 uppercase tracking-widest">إدارة المطور</div>
                        <div className="grid grid-cols-3 gap-2">
                          <button onClick={() => grantFoundUserMembership('famous')} className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white py-2 rounded-lg text-[8px] font-black transition-all">مشهور</button>
                          <button onClick={() => grantFoundUserMembership('influencer')} className="bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white py-2 rounded-lg text-[8px] font-black transition-all">مؤثر</button>
                          <button onClick={() => grantFoundUserMembership('premium')} className="bg-orange-500/10 hover:bg-orange-500 text-orange-500 hover:text-white py-2 rounded-lg text-[8px] font-black transition-all">مميز</button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'dms' && (
            <motion.div 
              key="dms"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">رسائلي الخاصة</h2>
              </div>

              {dmConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-20">
                  <MessageSquare className="w-20 h-20 mb-4" />
                  <p className="font-bold">لا توجد رسائل خاصة بعد</p>
                </div>
              ) : (
                dmConversations.map((conv: any) => (
                  <div 
                    key={conv.uid}
                    onClick={() => openPrivateChat(conv)}
                    className="flex items-center gap-4 p-4 bg-[#0a0f18]/60 border border-white/5 rounded-2xl cursor-pointer hover:bg-white/5 transition-all relative group"
                  >
                    <div className="relative group/avatar" onClick={(e) => { 
                      e.stopPropagation(); 
                      setSelectedProfile({ 
                        uid: conv.uid,
                        displayName: conv.displayName,
                        photoURL: conv.photoURL
                      }); 
                    }}>
                      <img 
                        src={conv.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${conv.displayName || 'User'}`} 
                        className="w-12 h-12 rounded-xl border border-white/10 group-hover/avatar:border-indigo-500/50 transition-all" 
                        alt="conv"
                        loading="lazy"
                      />
                    </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h3 className="font-bold text-sm"><span>{conv.displayName}</span></h3>
                          {conv.unreadCount > 0 && (
                            <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-lg">
                              <span>{conv.unreadCount}</span>
                            </span>
                          )}
                        </div>
                        <p className={`text-xs truncate ${conv.isOrder ? 'text-red-500 font-extrabold animate-pulse flex items-center gap-1' : 'text-gray-500'}`}>
                          {conv.isOrder && <Sparkles className="w-3 h-3 text-red-500" />}
                          <span>{conv.lastMessage}</span>
                        </p>
                      </div>
                    <ChevronLeft className="w-4 h-4 text-gray-700 rotate-180 group-hover:text-indigo-400 transition-colors" />
                  </div>
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8 flex flex-col items-center py-10"
            >
              <div className="relative group">
                <div className="w-32 h-32 rounded-[2.5rem] bg-indigo-600/20 p-1">
                  <img 
                    src={previewURL || userData?.photoURL || user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || 'User'}`} 
                    className="w-full h-full rounded-[2.2rem] object-cover border-2 border-indigo-500 shadow-2xl" 
                    alt="profile" 
                  />
                </div>
                <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center border-4 border-[#05070a] text-white shadow-xl hover:scale-110 transition-transform cursor-pointer disabled:opacity-50">
                  {isUploadingImage ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    disabled={isUploadingImage}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleInstantImageUpload(file);
                      }
                    }}
                  />
                </label>
              </div>

              <AnimatePresence>
                {showSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-green-500 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg"
                  >
                    <Check className="w-3 h-3" />
                    تم حفظ التعديلات بنجاح ✅
                  </motion.div>
                )}
              </AnimatePresence>

              {isEditingProfile ? (
                <div className="w-full space-y-4 bg-[#0a0f18]/60 p-6 rounded-3xl border border-white/10 backdrop-blur-xl">
                   <div>
                     <label className="text-[10px] text-gray-500 font-bold mr-2 uppercase">الاسم المستعار</label>
                     <input 
                       value={newDisplayName}
                       onChange={(e) => setNewDisplayName(e.target.value)}
                       placeholder="ادخل اسمك هنا..."
                       className="w-full bg-[#05070a] border border-white/10 rounded-xl p-3 text-sm mt-1 outline-none focus:border-indigo-500 transition-colors"
                     />
                   </div>

                   <div>
                     <label className="text-[10px] text-gray-500 font-bold mr-2 uppercase">اليوزرات (Username)</label>
                     <input 
                       value={newUsername}
                       onChange={(e) => setNewUsername(e.target.value)}
                       placeholder="مثال: aa, user123..."
                       className="w-full bg-[#05070a] border border-white/10 rounded-xl p-3 text-sm mt-1 outline-none focus:border-indigo-500 transition-colors"
                     />
                   </div>
                   
                   <div className="flex gap-2 pt-2">
                     <button 
                       disabled={isSaving}
                       onClick={handleSaveProfile}
                       className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                     >
                       {isSaving ? (
                         <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                       ) : (
                         <Check className="w-4 h-4" />
                       )}
                       حفظ التعديلات
                     </button>
                     <button 
                       onClick={() => { setIsEditingProfile(false); setPreviewURL(''); }}
                       className="flex-1 bg-white/5 text-gray-400 py-3 rounded-xl font-bold text-xs"
                     >
                       إلغاء
                     </button>
                   </div>
                </div>
              ) : (
                <div className="text-center">
                  <h2 className="text-2xl font-black mb-1 flex items-center justify-center gap-2">
                    <span>{userData?.displayName || user.displayName || 'عضو ملكي'}</span>
                    <Edit2 className="w-4 h-4 text-gray-600 cursor-pointer hover:text-indigo-400" onClick={() => { 
                      setIsEditingProfile(true); 
                      setNewDisplayName(userData?.displayName || user.displayName || '');
                      setNewUsername(userData?.username || '');
                    }} />
                  </h2>
                    <div className="text-indigo-400 text-xs font-bold uppercase tracking-widest bg-indigo-400/10 px-3 py-1 rounded-full inline-block">
                      <span>{user.email === ADMIN_EMAIL ? 'المطور الملكي 👑' : (userData?.isVip ? userData.membership.toUpperCase() : 'عضو موثق')}</span>
                    </div>
                  {(userData?.username) && (
                    <div className="mt-2 text-indigo-400 text-[10px] font-black tracking-widest bg-indigo-400/5 px-2 py-0.5 rounded border border-indigo-500/20 shadow-lg uppercase">
                      <span>Username: {userData.username}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Famous User Room Management */}
              {userData?.membership === 'famous' && (
                <div className="w-full mt-6 space-y-4">
                  <div className="w-full h-px bg-white/5 my-4" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
                      <h3 className="text-lg font-black text-amber-500">غرفتي الخاصة 🎪</h3>
                    </div>
                    {famousRoom && (
                       <button 
                        onClick={toggleRoomLock}
                        className={`p-2 rounded-xl border transition-all ${famousRoom.isLocked ? 'bg-red-500/20 border-red-500/30 text-red-500' : 'bg-green-500/20 border-green-500/30 text-green-500'}`}
                        title={famousRoom.isLocked ? 'فتح الغرفة' : 'قفل الغرفة'}
                      >
                        {famousRoom.isLocked ? <Ban className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  {isManagingRoom ? (
                    <div className="bg-amber-500/10 p-6 rounded-3xl border border-amber-500/20 space-y-4">
                      <div>
                        <label className="text-[10px] text-amber-500 font-black mr-2 uppercase">اسم الغرفة الخاصة</label>
                        <input 
                          value={roomNameInput}
                          onChange={(e) => setRoomNameInput(e.target.value)}
                          placeholder="مثال: مجلس المشاهير، خيمة النقاش..."
                          className="w-full bg-[#05070a] border border-amber-500/20 rounded-xl p-3 text-sm mt-1 outline-none focus:border-amber-500 text-amber-500 font-bold"
                          maxLength={30}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={handleCreateOrUpdateRoom}
                          className="flex-1 bg-amber-500 text-[#05070a] py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4" />
                          حفظ وتنشيط الغرفة
                        </button>
                        <button 
                          onClick={() => setIsManagingRoom(false)}
                          className="flex-1 bg-white/5 text-gray-500 py-3 rounded-xl font-bold text-xs"
                        >إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => {
                        setIsManagingRoom(true);
                        setRoomNameInput(famousRoom?.name || '');
                      }}
                      className="w-full group relative p-6 bg-gradient-to-br from-amber-400 to-amber-600 rounded-3xl shadow-[0_20px_40px_rgba(245,158,11,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all overflow-hidden"
                    >
                      <Crown className="absolute -right-4 -top-4 w-32 h-32 text-white/10 rotate-12" />
                      <div className="relative z-10 flex flex-col items-center text-center">
                        <span className="text-sm font-black text-white uppercase tracking-tighter">إدارة غرفتك الملكية</span>
                        <h4 className="text-2xl font-black text-white mt-1">
                          {famousRoom ? `غرفة ${famousRoom.name}` : 'إنشاء غرفتي الخاصة 🎪'}
                        </h4>
                        <div className="mt-3 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2">
                           <Edit2 className="w-3 h-3 text-white" />
                           <span className="text-[10px] text-white font-bold">انقر للتعديل أو الإنشاء</span>
                        </div>
                      </div>
                    </button>
                  )}
                  
                  {famousRoom && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[#0a0f18]/60 p-4 rounded-2xl border border-white/5 text-center">
                        <div className="text-xl font-black text-amber-500 mb-0.5">{roomCounts[famousRoom.id] || 0}/20</div>
                        <div className="text-[9px] text-gray-500 font-black uppercase">الحضور الحالي</div>
                      </div>
                      <button 
                        onClick={() => handleEnterRoom(famousRoom.id)}
                        className="bg-indigo-600/10 border border-indigo-500/20 p-4 rounded-2xl text-center hover:bg-indigo-600 transition-all group"
                      >
                         <div className="text-xs font-black text-indigo-400 group-hover:text-white">دخول غرفتك</div>
                         <div className="text-[8px] text-indigo-400/60 group-hover:text-white/60">بصفتك المالك</div>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="w-full h-px bg-white/5 my-6" />

              <button 
                onClick={() => auth.signOut()}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/10 font-bold text-sm hover:bg-red-500 hover:text-white transition-all active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج الملكي</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {activeRoom && (
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="fixed inset-0 z-[8000] bg-[#05070a]"
          >
            <ChatRoom 
              room={activeRoom} 
              roomName={(roomsList.find(r => r.id === activeRoom)?.name || privateRooms.find(r => r.id === activeRoom)?.name || 'دردشة')} 
              onBack={() => setActiveRoom(null)} 
              onOpenDM={(u) => openPrivateChat(u)} 
              onOpenProfile={(u) => setSelectedProfile(u)}
              userData={userData || undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dmTarget && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed inset-0 z-[9000] bg-[#05070a]"
          >
            <PrivateChat 
              targetUser={dmTarget} 
              myId={(user?.email === ADMIN_EMAIL ? 'dev_admin_account_lm656508' : user?.uid) || ''}
              onBack={() => { setDmTarget(null); setDmInitialMessage(undefined); }} 
              initialMessage={dmInitialMessage} 
              userData={userData}
              onEnterRoom={handleEnterRoom}
              onOpenProfile={(u) => setSelectedProfile(u)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-[#0a0f18]/95 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around px-4 z-50">
        <button 
          onClick={() => setActiveTab('rooms')}
          className={`flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === 'rooms' ? 'text-orange-400' : 'text-gray-500'}`}
        >
          <LayoutGrid className={activeTab === 'rooms' ? 'w-6 h-6' : 'w-5 h-5 opacity-60'} />
          <span className="text-[10px] font-black">الغرف</span>
        </button>

        <button 
          onClick={() => setActiveTab('store')}
          className={`flex flex-col items-center gap-1 transition-all flex-1 relative -top-3`}
        >
          <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center shadow-[0_8px_20px_rgba(249,115,22,0.3)] border-4 border-[#05070a] transition-all active:scale-90 ${activeTab === 'store' ? 'scale-110 ring-4 ring-orange-500/20' : 'opacity-80'}`}>
            <Crown className="w-7 h-7 text-white" />
          </div>
          <span className={`text-[10px] font-black ${activeTab === 'store' ? 'text-orange-500' : 'text-gray-500'}`}>المتجر</span>
        </button>

        <button 
          onClick={() => setActiveTab('dms')}
          className={`flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === 'dms' ? 'text-orange-400' : 'text-gray-500'}`}
        >
          <div className="relative">
            <MessageSquare className={activeTab === 'dms' ? 'w-6 h-6' : 'w-5 h-5 opacity-60'} />
            {hasNewDMs && (
              <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#0a0f18] animate-pulse">
                {unreadCount > 9 ? '+9' : unreadCount}
              </div>
            )}
          </div>
          <span className="text-[10px] font-black">الخاص</span>
        </button>

        <button 
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === 'search' ? 'text-orange-400' : 'text-gray-500'}`}
        >
          <Search className={activeTab === 'search' ? 'w-6 h-6' : 'w-5 h-5 opacity-60'} />
          <span className="text-[10px] font-black">البحث</span>
        </button>

        <button 
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === 'profile' ? 'text-orange-400' : 'text-gray-500'}`}
        >
          <Users className={activeTab === 'profile' ? 'w-6 h-6' : 'w-5 h-5 opacity-60'} />
          <span className="text-[10px] font-black">بروفايلي</span>
        </button>
      </nav>

      {/* GLOBAL USER PROFILE MODAL */}
      <AnimatePresence>
        {selectedProfile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
            onClick={() => setSelectedProfile(null)}
          >
            {/* Background dynamic glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px]" />
            </div>

            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.4 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0a0f18]/90 border border-white/10 p-1 rounded-[3.5rem] w-full max-w-sm shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] relative overflow-hidden backdrop-blur-3xl"
            >
              <div className="bg-[#05070a] p-8 rounded-[3.2rem] flex flex-col items-center min-h-[450px] justify-center relative">
                {/* Profile Header */}
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full" />
                  <img 
                    src={(fullProfileData?.photoURL || selectedProfile.photoURL) || `https://api.dicebear.com/7.x/initials/svg?seed=${selectedProfile.displayName || 'User'}`}
                    className={`w-36 h-36 rounded-[3rem] border-4 ${(fullProfileData?.email === ADMIN_EMAIL || selectedProfile.uid === 'dev_admin_account_lm656508') ? 'border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.2)]' : 'border-indigo-500/30'} shadow-2xl object-cover relative z-10`}
                    alt="avatar"
                  />
                  {(fullProfileData?.isVip || selectedProfile.uid === 'dev_admin_account_lm656508') && (
                    <div className="absolute -bottom-2 -left-2 w-12 h-12 bg-amber-500 rounded-[1.2rem] flex items-center justify-center border-4 border-[#05070a] shadow-xl z-20">
                      <Crown className="w-6 h-6 text-white" />
                    </div>
                  )}
                </div>

                <div className="text-center mb-6">
                  <h3 className="text-3xl font-black mb-1 flex items-center justify-center gap-2">
                    <span>{fullProfileData?.displayName || selectedProfile.displayName || 'عضو ملكي'}</span>
                    {(fullProfileData?.email === ADMIN_EMAIL || selectedProfile.uid === 'dev_admin_account_lm656508') && <ShieldCheck className="w-6 h-6 text-amber-500" />}
                  </h3>
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-indigo-400 text-[11px] font-black uppercase tracking-widest bg-indigo-500/10 px-4 py-1 rounded-full border border-indigo-500/20">
                      @{fullProfileData?.username || selectedProfile.username || 'user'}
                    </div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                      الرتبة: <span className={(fullProfileData?.isVip || selectedProfile.uid === 'dev_admin_account_lm656508') ? 'text-amber-500' : 'text-indigo-400'}>
                        {(fullProfileData?.email === ADMIN_EMAIL || selectedProfile.uid === 'dev_admin_account_lm656508') ? 'المطور 👑' : (fullProfileData?.isVip ? (fullProfileData.role || fullProfileData.membership || 'GOLDEN').toUpperCase() : 'عضو ملكي')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Main Actions */}
                <div className="w-full flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      openPrivateChat(fullProfileData || selectedProfile);
                      setSelectedProfile(null);
                    }}
                    className="w-full bg-white text-[#05070a] py-5 rounded-[2rem] font-black text-sm shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-5 h-5 fill-current" />
                    <span>مراسلة خاصة 💬</span>
                  </button>
                  
                  {/* Admin Tools Panel */}
                  {isAdmin && (fullProfileData?.email !== ADMIN_EMAIL && selectedProfile.uid !== 'dev_admin_account_lm656508') && (
                    <div className="mt-4 pt-6 border-t border-white/5 w-full space-y-4">
                      <div className="text-[10px] text-amber-500/50 font-black uppercase tracking-[0.2em] text-center">الإدارة الملكية</div>
                      
                      <div className="grid grid-cols-3 gap-2">
                        <button 
                          onClick={() => grantRankGlobal(selectedProfile.uid, 'famous')}
                          className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-2xl text-[9px] font-black transition-all"
                        >مشهور</button>
                        <button 
                         onClick={() => grantRankGlobal(selectedProfile.uid, 'influencer')}
                          className="bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white py-3 rounded-2xl text-[9px] font-black transition-all"
                        >مؤثر</button>
                        <button 
                          onClick={() => grantRankGlobal(selectedProfile.uid, 'premium')}
                          className="bg-orange-500/10 hover:bg-orange-500 text-orange-500 hover:text-white py-3 rounded-2xl text-[9px] font-black transition-all"
                        >مميز</button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => toggleMuteUser(selectedProfile.uid, fullProfileData?.isMuted)}
                          className={`flex items-center justify-center gap-2 py-4 rounded-2xl border transition-all text-sm font-bold ${
                            fullProfileData?.isMuted 
                              ? 'bg-amber-500/20 border-amber-500/20 text-amber-500' 
                              : 'bg-gray-500/10 border-white/5 text-gray-400'
                          }`}
                        >
                          <VolumeX className="w-4 h-4" />
                          <span>{fullProfileData?.isMuted ? 'إلغاء الكتم' : 'كتم'}</span>
                        </button>
                        <button 
                          onClick={() => kickUser(selectedProfile.uid)}
                          className="flex items-center justify-center gap-2 py-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl transition-all text-sm font-bold active:scale-95"
                        >
                          <Ban className="w-4 h-4" />
                          <span>طرد</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => setSelectedProfile(null)}
                    className="w-full text-gray-600 py-3 font-bold text-xs hover:text-gray-400 transition-colors mt-2"
                  >
                    إغلاق الملف الشخصي
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

