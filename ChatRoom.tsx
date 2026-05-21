import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, doc, onSnapshot, query as fsQuery, orderBy, limit, deleteDoc, updateDoc, deleteField, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { auth, db } from '../firebase';
import { Send, LogOut, MessageSquare, Crown, User as UserIcon, ChevronLeft, Trash2, ShieldCheck, Shield, Ban, UserMinus, MoreVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserData } from '../types';

interface Message {
  id: string;
  text: string;
  uid: string;
  email?: string;
  displayName: string;
  photoURL: string;
  timestamp: any;
  membership?: 'premium' | 'influencer' | 'famous' | null;
  isVip?: boolean;
  isManager?: boolean;
  username?: string | null;
  createdAt?: any;
}

export default function ChatRoom({ room, roomName, onBack, onOpenDM, onOpenProfile, userData }: { room: string; roomName: string; onBack: () => void, onOpenDM?: (u: UserData) => void, onOpenProfile?: (u: UserData) => void, userData?: UserData }) {
  const roomId = room;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [userMembership, setUserMembership] = useState<string | null>(userData?.membership || null);
  const [userIsVip, setUserIsVip] = useState(!!(userData?.isVip || (auth.currentUser?.email === 'lm656508@gmail.com')));
  const [isMuted, setIsMuted] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [showRoyalEntry, setShowRoyalEntry] = useState(false);
  const [profilesCache, setProfilesCache] = useState<Record<string, any>>({});
  const [privateRoomData, setPrivateRoomData] = useState<any>(null);
  const [showBannedModal, setShowBannedModal] = useState(false);
  const [bannedUsersList, setBannedUsersList] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const effectiveMyUid = auth.currentUser?.email === 'lm656508@gmail.com' ? 'dev_admin_account_lm656508' : auth.currentUser?.uid;

  useEffect(() => {
    // Listen to private room settings
    const pRoomRef = doc(db, 'private_rooms', room);
    const unsub = onSnapshot(pRoomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPrivateRoomData(data);
        
        // Active Ban Check: If I am currently in the room and get banned, kick me out
        if (data.bannedUsers && effectiveMyUid && data.bannedUsers[effectiveMyUid]) {
          alert('لقد تم طردك من هذه الغرفة بواسطة المشهور 🚫');
          onBack();
        }

        // Update local banned users list for the modal
        if (data.bannedUsers) {
          const uids = Object.keys(data.bannedUsers);
          const list = uids.map(uid => ({
            uid,
            displayName: profilesCache[uid]?.displayName || 'عضو غير معروف',
            username: profilesCache[uid]?.username || '...'
          }));
          setBannedUsersList(list);
        } else {
          setBannedUsersList([]);
        }
      } else {
        setPrivateRoomData(null);
        setBannedUsersList([]);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `private_rooms/${room}`));

    return () => unsub();
  }, [room, effectiveMyUid, profilesCache]);

  const handleKickFromPrivateRoom = async (targetUid: string, targetName: string) => {
    if (!privateRoomData || privateRoomData.ownerId !== effectiveMyUid) return;
    if (confirm(`هل أنت متأكد من طرد ${targetName} وحظره نهائياً من غرفتك؟`)) {
      try {
        const pRoomRef = doc(db, 'private_rooms', room);
        await updateDoc(pRoomRef, {
          [`bannedUsers.${targetUid}`]: true
        });
        
        // Send a system message announcement
        const messagesCol = collection(doc(db, 'rooms', room), 'messages');
        const clientTime = Date.now();
        await addDoc(messagesCol, {
          text: `المشهور ${privateRoomData.ownerName} قام بطرد ${targetName} خارج الغرفة 🎪🚫`,
          uid: 'system_announcement',
          timestamp: clientTime,
          createdAt: clientTime,
          displayName: 'System'
        });
      } catch (err) {
        console.error("Kick error:", err);
      }
    }
  };

  const handleUnban = async (targetUid: string) => {
    if (!privateRoomData || privateRoomData.ownerId !== effectiveMyUid) return;
    try {
      const pRoomRef = doc(db, 'private_rooms', room);
      await updateDoc(pRoomRef, {
        [`bannedUsers.${targetUid}`]: deleteField()
      });
    } catch (err) {
      console.error("Unban error:", err);
    }
  };

  const toggleRoomLock = async () => {
    if (!privateRoomData || privateRoomData.ownerId !== effectiveMyUid) return;
    const roomRef = doc(db, 'private_rooms', room);
    await updateDoc(roomRef, { isLocked: !privateRoomData.isLocked });
  };

  useEffect(() => {
    // Royal Entry Notification Listener
    const entryRef = doc(db, 'rooms', room, 'entry_events', 'royal');
    const unsubscribeEntry = onSnapshot(entryRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.timestamp > Date.now() - 5000) { // Only show if event is fresh (last 5s)
          setShowRoyalEntry(true);
          setTimeout(() => setShowRoyalEntry(false), 4000); // Auto hide after 4s
        }
      }
    }, (err) => console.error("Royal entry error:", err));

    // If current user is the developer, trigger the entry event
    if (auth.currentUser?.email === 'lm656508@gmail.com') {
      window.localStorage.setItem('dody_golden_id', '11111'); // Local hint
      setDoc(entryRef, {
        timestamp: Date.now(),
        type: 'royal_entry'
      }).catch(err => console.error("Entry write error:", err));
    }

    return () => unsubscribeEntry();
  }, [room]);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const effectiveUid = auth.currentUser.email === 'lm656508@gmail.com' ? 'dev_admin_account_lm656508' : auth.currentUser.uid;
    const presenceRef = doc(db, 'rooms_presence', room);
    
    // Set presence
    setDoc(presenceRef, { [effectiveUid]: true, timestamp: Date.now() }, { merge: true })
      .catch(err => console.error("Presence set error:", err));

    return () => {
      updateDoc(presenceRef, { [effectiveUid]: deleteField() })
        .catch(err => console.error("Presence delete error:", err));
    };
  }, [room]);

  useEffect(() => {
    if (userData) {
      setUserIsVip(!!userData.isVip);
      setUserMembership(userData.isVip ? userData.membership : null);
      setUsername(userData.username || null);
      setIsMuted(!!userData.isMuted);
    }
  }, [userData]);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const effectiveUid = auth.currentUser.email === 'lm656508@gmail.com' ? 'dev_admin_account_lm656508' : auth.currentUser.uid;
    
    // Unified Meta Listener for self (Muted, Banned, Membership, VIP Status)
    const path = `users/${effectiveUid}`;
    const unsubMeta = onSnapshot(doc(db, 'users', effectiveUid), (docSnap: any) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.isBanned) {
          alert('لقد تم طردك نهائياً من التطبيق بواسطة الإدارة ⚠️');
          auth.signOut();
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, path));

    return () => unsubMeta();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const effectiveUid = auth.currentUser.email === 'lm656508@gmail.com' ? 'dev_admin_account_lm656508' : auth.currentUser.uid;
    
    // Live Firestore Sync specifically requested for the current user
    const path = `users/${effectiveUid}`;
    const unsubFirestoreSync = onSnapshot(doc(db, 'users', effectiveUid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserIsVip(!!data.isVip);
        setUserMembership(data.isVip ? data.membership : null);
        setUsername(data.username || null);
        setIsMuted(!!data.isMuted);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, path));

    // Global listener for users collection to ensure everyone sees rank changes instantly
    const usersCol = collection(db, 'users');
    const unsubAll = onSnapshot(usersCol, (snapshot) => {
      const cache: Record<string, any> = {};
      snapshot.forEach((uDoc) => {
        cache[uDoc.id] = uDoc.data();
      });
      setProfilesCache(cache);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'users'));

    return () => {
      unsubFirestoreSync();
      unsubAll();
    };
  }, []);

  useEffect(() => {
    if (!roomId) { console.error("Room ID is missing!"); return; }
    setLoading(true);
    
    // Subscriber to Firestore collection
    const messagesRef = collection(doc(db, 'rooms', roomId), 'messages');
    const q = fsQuery(messagesRef, orderBy('timestamp', 'asc'), limit(50));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((docSnap) => {
        const val = docSnap.data();
        if (!val) return;
        const rawTime = val.timestamp || val.createdAt;
        
        let calculatedDate = new Date();
        if (rawTime) {
          if (typeof rawTime === 'number') {
            calculatedDate = new Date(rawTime);
          } else if (rawTime instanceof Date) {
            calculatedDate = rawTime;
          } else if (typeof rawTime.toDate === 'function') {
            calculatedDate = rawTime.toDate();
          } else if (typeof rawTime.toMillis === 'function') {
            calculatedDate = new Date(rawTime.toMillis());
          } else if (typeof rawTime === 'string') {
            const parsed = Date.parse(rawTime);
            if (!isNaN(parsed)) {
              calculatedDate = new Date(parsed);
            }
          }
        }
        
        const timestampNum = calculatedDate.getTime() || Date.now();
        
        msgs.push({
          id: docSnap.id,
          text: val.text || '',
          uid: val.uid || '',
          displayName: val.displayName || 'عضو غير معروف',
          photoURL: val.photoURL || '',
          membership: val.membership || null,
          isVip: !!val.isVip,
          isManager: !!val.isManager,
          username: val.username || null,
          ...val,
          timestamp: timestampNum,
          createdAt: calculatedDate
        });
      });
      
      console.log("Room ID:", roomId, "Fetched Firestore messages:", msgs);
      setMessages(msgs);
      setLoading(false);
    }, (error) => {
      console.error("Critical Chat Error (Firestore):", error);
      handleFirestoreError(error, OperationType.GET, `rooms/${roomId}/messages`);
      setLoading(false);
    });

    const fallbackTimer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => {
      unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, [roomId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId) { console.error("Room ID is missing!"); return; }
    if (!inputText.trim() || !auth.currentUser || isMuted) return;

    const text = inputText;
    setInputText('');
    console.log("Sending message to room ID:", roomId, "with text:", text);

    try {
      // Determine membership
      let membership = userMembership;

      // Auto-assign famous to manager if not already set
      if (auth.currentUser.email === 'lm656508@gmail.com') {
        if (!membership) membership = 'famous';
      }

      // Prepare payload
      const isDev = auth.currentUser.email === 'lm656508@gmail.com' || auth.currentUser.uid === 'dev_admin_account_lm656508';
      const senderUid = isDev ? 'dev_admin_account_lm656508' : auth.currentUser.uid;
      const clientTime = Date.now();
      
      const payload = {
        text,
        uid: senderUid,
        displayName: userData?.displayName || (isDev ? 'دودي-Dody 👑' : (auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Unknown')),
        photoURL: userData?.photoURL || auth.currentUser.photoURL || '',
        timestamp: clientTime,
        membership: userMembership, // Use current active membership
        isVip: userIsVip || isDev,
        isManager: isDev,
        username: isDev ? 'aa' : (username || null)
      };

      // Firestore Write
      try {
        const firestorePayload = {
          text,
          uid: senderUid,
          displayName: payload.displayName,
          photoURL: payload.photoURL,
          membership: payload.membership || null,
          isVip: payload.isVip || false,
          isManager: payload.isManager || false,
          username: payload.username || null,
          createdAt: clientTime,
          timestamp: clientTime
        };
        await addDoc(collection(doc(db, 'rooms', roomId), 'messages'), firestorePayload);
      } catch (err) {
        console.error("Firestore message write error:", err);
        handleFirestoreError(err, OperationType.CREATE, `rooms/${roomId}/messages`);
      }
    } catch (err) {
      console.error("Overall message send error:", err);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الرسالة؟')) return;
    
    try {
      await deleteDoc(doc(db, 'rooms', room, 'messages', messageId));
    } catch (err: any) {
      console.error("Error deleting message:", err?.message || String(err));
      alert("فشل في حذف الرسالة.");
    }
  };

  const currentUserEmail = auth.currentUser?.email;
  const isAdmin = currentUserEmail === 'lm656508@gmail.com';

  return (
    <div className="flex flex-col h-[100dvh] bg-[#05070a] text-white font-arabic" dir="rtl">
      {/* Immersive Background */}
      <div className="absolute inset-0 bg-[#05070a] -z-10" />
      <div className="absolute top-0 right-0 w-full h-[50%] bg-gradient-to-b from-indigo-900/10 to-transparent -z-10" />
      
      {/* Header */}
      <header className="h-20 shrink-0 flex items-center justify-between px-6 border-b border-white/5 bg-[#0a0f18]/60 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-indigo-600/20 rounded-full transition-all text-indigo-400 group active:scale-90"
          >
            <ChevronLeft className="w-5 h-5 rotate-180 group-hover:translate-x-0.5 transition-transform" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center bg-[#05070a] rounded-xl border border-white/10 overflow-hidden">
               <div className="text-xl">🤴</div>
            </div>
              <div className="flex flex-col items-start">
                <span className="text-sophisticated-gold text-[9px] font-black tracking-[0.2em] uppercase opacity-70 mb-0.5">
                  شاتنا - CHATNA
                </span>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black gold-gradient-text">
                    <span>{privateRoomData ? `غرفة ${privateRoomData.name}` : `قاعة ${roomName}`}</span>
                  </h2>
                  {isAdmin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                  {privateRoomData?.ownerId === effectiveMyUid && (
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={toggleRoomLock}
                        className={`p-1.5 rounded-lg border transition-all ${privateRoomData.isLocked ? 'bg-red-500/20 border-red-500/20 text-red-500' : 'bg-green-500/20 border-green-500/20 text-green-500'}`}
                        title={privateRoomData.isLocked ? 'فتح الغرفة' : 'قفل الغرفة'}
                      >
                        {privateRoomData.isLocked ? <Ban className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                      </button>
                      <button 
                        onClick={() => setShowBannedModal(true)}
                        className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:text-white transition-all"
                        title="إدارة المحظورين"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        <button 
          onClick={() => auth.signOut()}
          className="w-10 h-10 flex items-center justify-center bg-red-500/5 hover:bg-red-500/20 border border-red-500/10 rounded-xl transition-all text-red-400 active:scale-95"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pt-8 pb-[100px] space-y-6 scroll-smooth relative"
      >
        <AnimatePresence>
          {showRoyalEntry && (
            <motion.div 
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.y < -20) setShowRoyalEntry(false);
              }}
              className="fixed top-24 left-4 right-4 z-[60] flex justify-center pointer-events-none"
            >
              <div className="bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 p-[1px] rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.4)] pointer-events-auto">
                <div className="bg-[#0a0f18] px-6 py-2.5 rounded-2xl flex items-center gap-3">
                  <div className="bg-amber-500/20 p-1.5 rounded-lg">
                    <Crown className="w-5 h-5 text-amber-500 fill-amber-500 animate-pulse" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-black gold-gradient-text uppercase tracking-tighter">
                      👑 تم دخول المطور دودي-Dody إلى الغرفة الآن
                    </span>
                    <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-indigo-500 animate-spin mb-2 mx-auto" />
            <p className="text-[10px] text-gray-400 font-bold">جاري تحديث القاعة...</p>
          </div>
        )}

        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-30">
            <MessageSquare className="w-16 h-16 mb-4 text-indigo-400" />
            <p className="text-lg font-bold">بدء المحادثة</p>
            <p className="text-xs">تكلم بما يليق بفخامتك</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                const isMe = msg.uid === effectiveMyUid;
                const realAdminUid = 'dev_admin_account_lm656508';
                const msgIsManager = msg.uid === realAdminUid || (msg as any).username === 'aa' || (msg as any).isManager === true;
                
                // Reactive sync - checks profilesCache first for real-time rank updates
                const liveProfile = profilesCache[msg.uid] || {};
                const currentRole = liveProfile.role || liveProfile.membership || msg.role || msg.membership;
                let hasVip = (liveProfile.isVip || msg.isVip || msgIsManager || !!currentRole);
                let membershipType = hasVip ? currentRole : null;
                
                if (isMe) {
                  const myRole = userData?.role || userData?.membership || userMembership;
                  hasVip = (userIsVip || isAdmin || !!myRole);
                  membershipType = hasVip ? myRole : null;
                }

                // Force Dody's permanent prestige override if no specific role set
                if (msgIsManager && !membershipType) {
                  hasVip = true;
                  membershipType = 'famous';
                }

                if (msg.uid === 'system_announcement') {
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex justify-center p-4"
                    >
                      <div className="bg-amber-500/5 border border-amber-500/20 px-8 py-3 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.1)] text-center">
                        <span className="text-[16px] font-black gold-gradient-text uppercase tracking-widest leading-loose">
                          <span>{msg.text} 👑</span>
                        </span>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2 group/msg`}
                  >
                    <div className={`flex flex-col gap-1 max-w-[85%] ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-1.5 ${isMe ? 'ml-auto mr-2 flex-row-reverse' : 'mr-auto ml-2'}`}>
                        <button 
                          onClick={() => onOpenProfile?.({ 
                            uid: msg.uid, 
                            displayName: msg.displayName || (msgIsManager ? 'دودي-Dody 👑' : 'عضو ملكي'),
                            photoURL: msg.photoURL,
                            username: (msg as any).username
                          })}
                          className={`
                            text-[13px] font-bold hover:underline transition-all
                            ${msgIsManager ? 'text-amber-500' : 'text-indigo-400'}
                            ${membershipType === 'premium' ? '!text-amber-400' : ''}
                            ${membershipType === 'influencer' ? '!text-green-400' : ''}
                            ${membershipType === 'famous' ? '!text-red-500' : ''}
                          `}
                        >
                          <span>{msgIsManager ? (msg.displayName || 'دودي-Dody 👑') : msg.displayName}</span>
                        </button>
                        {msgIsManager && <Shield className="w-3 h-3 text-amber-500 fill-amber-500/10" />}
                        {membershipType === 'famous' && (
                          <span className="animated-gold-tag text-[12px]"><span>#المشهور</span></span>
                        )}
                        {membershipType === 'influencer' && (
                          <span className="text-green-400 text-[11px] font-bold"><span>#المؤثر</span></span>
                        )}
                        {membershipType === 'premium' && (
                          <span className="text-orange-400 text-[11px] font-bold"><span>#المميز</span></span>
                        )}
                        {msgIsManager && (
                          <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-black"><span>ADMIN</span></span>
                        )}
                        {!isMe && privateRoomData?.ownerId === effectiveMyUid && msg.uid !== 'system_announcement' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleKickFromPrivateRoom(msg.uid, msg.displayName); }}
                            className="p-1 bg-red-500/10 text-red-500 rounded-md hover:bg-red-500 hover:text-white transition-all active:scale-90"
                            title="طرد وحظر من الغرفة"
                          >
                            <UserMinus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      
                      <div className="relative group flex items-end gap-2">
                        {!isMe && (
                          <div className="flex flex-col gap-1 items-center">
                            <button 
                              onClick={() => onOpenProfile?.({ 
                                uid: msg.uid, 
                                displayName: msg.displayName || 'عضو ملكي',
                                photoURL: msg.photoURL,
                                username: (msg as any).username
                              })}
                              className="relative active:scale-95 transition-transform shrink-0"
                            >
                              <img 
                                src={msg.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.displayName || 'User'}`} 
                                className={`w-9 h-9 rounded-full border object-cover ${msgIsManager ? 'border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'border-white/10'} ${isAdmin ? 'ring-2 ring-amber-500/30' : ''}`}
                                alt="avatar"
                              />
                              {msgIsManager && <Crown className="absolute -top-1 -right-1 w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenDM?.({ uid: msg.uid, displayName: msg.displayName, photoURL: msg.photoURL, username: (msg as any).username });
                              }}
                              className="bg-indigo-600/20 p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all active:scale-90 shadow-sm"
                              title="مراسلة خاصة"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div 
                          className={`
                            px-4 py-2.5 rounded-[1.2rem] relative text-[15px] leading-relaxed transition-all shadow-xl
                            ${msgIsManager 
                                ? 'bg-[#1a160a] text-amber-100 rounded-br-none border border-amber-500/20 font-bold' 
                                : isMe 
                                  ? 'bg-[#0c1425] text-white rounded-bl-none border border-indigo-500/20' 
                                  : 'bg-[#0f172a] text-gray-200 rounded-br-none border border-white/5'
                            }
                            ${membershipType === 'premium' ? 'neon-gold-glow !bg-[#1a1005] !border-[#ff9900]/20' : ''}
                            ${membershipType === 'influencer' ? 'neon-green-glow !bg-[#051a0a] !border-[#39ff14]/20' : ''}
                            ${membershipType === 'famous' ? 'neon-red-glow !bg-[#0a0505] !border-[#ff0000]/30 font-bold' : ''}
                          `}
                        >
                          <p className="whitespace-pre-wrap"><span>{msg.text}</span></p>
                        </div>

                        {isMe && (
                          <button 
                            onClick={() => onOpenProfile?.({ 
                              uid: msg.uid, 
                              displayName: msg.displayName || 'عضو ملكي',
                              photoURL: msg.photoURL,
                              username: (msg as any).username
                            })}
                            className="relative shrink-0 active:scale-95 transition-transform"
                          >
                            <img 
                              src={msg.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.displayName || 'User'}`} 
                              className={`w-9 h-9 rounded-full border object-cover ${isAdmin ? 'border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'border-indigo-500/30'}`}
                              alt="avatar"
                            />
                            {isAdmin && <Crown className="absolute -top-1 -left-1 w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                          </button>
                        )}

                        {(isMe || isAdmin) && (
                          <button 
                            onClick={() => handleDeleteMessage(msg.id)}
                            className={`
                              absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all p-1.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg hover:bg-red-500 hover:text-white
                              ${isMe ? '-right-10' : '-left-10'}
                            `}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Input Section */}
      <div className="fixed bottom-0 left-0 w-full p-4 bg-[#05070a] border-t border-white/5 z-[60] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        {isMuted ? (
          <div className="max-w-2xl mx-auto p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center text-red-500 font-black text-sm animate-pulse">
            أنت مكتوم حالياً بواسطة الإدارة الملكية ⚠️
          </div>
        ) : (
          <form 
            onSubmit={handleSendMessage} 
            className="max-w-2xl mx-auto flex items-center gap-2 p-1.5 bg-[#0a0f18]/80 border border-white/5 rounded-2xl shadow-2xl backdrop-blur-xl"
          >
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="اكتب رسالتك الملكية..."
              className="flex-1 bg-transparent border-none outline-none text-sm px-3 placeholder:text-gray-600 font-bold"
            />
            <button 
              type="submit"
              disabled={!inputText.trim()}
              className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* User Profile Modal removed - now handled globally by App.tsx */}

      {/* Banned Users Modal for Famous Owner */}
      <AnimatePresence>
        {showBannedModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowBannedModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0a0f18] border border-amber-500/30 rounded-[2.5rem] shadow-[0_20px_50px_rgba(245,158,11,0.2)] overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 bg-gradient-to-r from-amber-500/10 to-transparent">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                       <Ban className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white">إدارة المطرودين 🎪</h3>
                      <p className="text-[10px] text-amber-500/60 font-black uppercase">قائمة الحظر الحالية لغرفتك</p>
                    </div>
                  </div>
                  <button onClick={() => setShowBannedModal(false)} className="text-gray-500 hover:text-white transition-colors">إغلاق</button>
                </div>
              </div>

              <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
                {bannedUsersList.length === 0 ? (
                  <div className="py-20 text-center opacity-30">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-3" />
                    <p className="text-sm font-bold">لا يوجد أي أشخاص محظورين حالياً</p>
                  </div>
                ) : (
                  bannedUsersList.map(u => (
                    <div key={u.uid} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
                           <UserIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">{u.displayName}</h4>
                          <span className="text-[10px] text-gray-500">@{u.username}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleUnban(u.uid)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-500 border border-green-500/20 rounded-xl text-[10px] font-black hover:bg-green-500 hover:text-white transition-all active:scale-90"
                      >
                        <ShieldCheck className="w-3 h-3" />
                        إلغاء الحظر 🔓
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

