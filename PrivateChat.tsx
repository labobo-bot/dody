import React, { useState, useEffect, useRef } from 'react';
import { ref, push, onValue, set, update, serverTimestamp, query, limitToLast, remove, get } from 'firebase/database';
import { auth, rtdb, db } from '../firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Send, ChevronLeft, MoreVertical, Ban, Trash2, Crown, Share2, MapPin, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserData, PrivateRoom } from '../types';

interface DMMessage {
  id: string;
  text?: string;
  uid: string;
  displayName?: string;
  photoURL?: string;
  membership?: string;
  isVip?: boolean;
  timestamp: number | object;
  pending?: boolean;
  type?: 'text' | 'private_room_invite';
  roomId?: string;
  roomName?: string;
  isManager?: boolean;
}

export default function PrivateChat({ 
  targetUser: initialTargetUser, 
  myId: propMyId,
  onBack, 
  initialMessage, 
  userData: initialUserData,
  onEnterRoom,
  onOpenProfile
}: { 
  targetUser: { uid: string, displayName: string, photoURL: string, username?: string }, 
  myId: string,
  onBack: () => void, 
  initialMessage?: string, 
  userData?: UserData,
  onEnterRoom?: (roomId: string) => void,
  onOpenProfile?: (u: UserData) => void
}) {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetUser, setTargetUser] = useState(initialTargetUser);
  const [myLiveStatus, setMyLiveStatus] = useState<UserData | null>(initialUserData || null);
  const [targetLiveStatus, setTargetLiveStatus] = useState<UserData | null>(null);
  const [targetFirestoreProfile, setTargetFirestoreProfile] = useState<UserData | null>(null);
  const [myFirestoreProfile, setMyFirestoreProfile] = useState<UserData | null>(null);
  const [inputText, setInputText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [amIBlocked, setAmIBlocked] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef(false);

  const [showGrantMenu, setShowGrantMenu] = useState(false);
  const [isGranting, setIsGranting] = useState<string | null>(null);
  const [grantSuccess, setGrantSuccess] = useState(false);
  
  const isDev = auth.currentUser?.email === 'lm656508@gmail.com';
  const realAdminUid = 'dev_admin_account_lm656508';

  const [myRoom, setMyRoom] = useState<PrivateRoom | null>(null);

  const myId = propMyId;
  const targetIdForMetadata = targetUser.uid;
  const sortedUids = [myId, targetIdForMetadata].sort();
  const chatId = `${sortedUids[0]}_${sortedUids[1]}`;

  useEffect(() => {
    if (!auth.currentUser) return;
    const effectiveMyUid = auth.currentUser.email === 'lm656508@gmail.com' ? realAdminUid : auth.currentUser.uid;
    const roomRef = ref(rtdb, `private_rooms/${effectiveMyUid}`);
    onValue(roomRef, (snap) => setMyRoom(snap.val()));
  }, [realAdminUid]);

  useEffect(() => {
    if (!targetIdForMetadata) return;
    const path = `users/${targetIdForMetadata}`;
    const unsub = onSnapshot(doc(db, 'users', targetIdForMetadata), (docSnap) => {
      if (docSnap.exists()) {
        setTargetFirestoreProfile({ ...docSnap.data(), uid: targetIdForMetadata });
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, path));
    return () => unsub();
  }, [targetIdForMetadata]);

  useEffect(() => {
    const effectiveMyUid = auth.currentUser?.email === 'lm656508@gmail.com' ? realAdminUid : auth.currentUser?.uid;
    if (!effectiveMyUid) return;
    const path = `users/${effectiveMyUid}`;
    const unsub = onSnapshot(doc(db, 'users', effectiveMyUid), (docSnap) => {
      if (docSnap.exists()) {
        setMyFirestoreProfile({ ...docSnap.data(), uid: effectiveMyUid });
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, path));
    return () => unsub();
  }, [realAdminUid]);

  useEffect(() => {
    const targetRef = ref(rtdb, `users/${targetIdForMetadata}`);
    const unsubTarget = onValue(targetRef, (snap) => {
      const data = snap.val();
      if (data) {
        setTargetLiveStatus(data);
        setTargetUser(prev => ({ ...prev, ...data, uid: targetIdForMetadata }));
      }
    });

    if (auth.currentUser) {
      const effectiveMyUid = auth.currentUser.email === 'lm656508@gmail.com' ? realAdminUid : auth.currentUser.uid;
      const myRef = ref(rtdb, `users/${effectiveMyUid}`);
      onValue(myRef, (snap) => {
        const data = snap.val();
        if (data) setMyLiveStatus(data);
      });
    }

    return () => unsubTarget();
  }, [targetIdForMetadata]);

  useEffect(() => {
    if (!auth.currentUser) return;
    setLoading(true);
    const blockedByMeRef = ref(rtdb, `blocks/${auth.currentUser.uid}/${targetUser.uid}`);
    const unsubBlockMe = onValue(blockedByMeRef, (snap) => setIsBlockedByMe(!!snap.val()));

    const amIBlockedRef = ref(rtdb, `blocks/${targetUser.uid}/${auth.currentUser.uid}`);
    const unsubAmIBlocked = onValue(amIBlockedRef, (snap) => setAmIBlocked(!!snap.val()));

    const dmPath = `private_messages/${chatId}`;
    const dmRef = query(ref(rtdb, dmPath), limitToLast(50));
    
    // Lightning fast real-time listener for private messages
    const unsubscribeMessages = onValue(dmRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Direct conversion to array with deterministic sorting
        const list = Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) as DMMessage[];
        list.sort((a: any, b: any) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
        setMessages(list);
      } else {
        setMessages([]);
      }
      setLoading(false);
    }, (error) => {
      console.error("DM sync error:", error);
      setLoading(false);
    });

    const fallbackTimer = setTimeout(() => {
      setLoading(false);
    }, 300);

    const myMetaRef = ref(rtdb, `user_dms/${auth.currentUser.uid}/${targetIdForMetadata}`);
    // Clear unread count instantly
    get(myMetaRef).then((snap) => {
      const data = snap.val();
      if (data && data.unreadCount > 0) {
        update(myMetaRef, { unreadCount: 0 });
      }
    });

    return () => {
      unsubscribeMessages();
      unsubBlockMe();
      unsubAmIBlocked();
      clearTimeout(fallbackTimer);
    };
  }, [chatId]);

  const sendMessage = async (text: string, type: 'text' | 'private_room_invite' = 'text') => {
    if ((!text.trim() && type === 'text') || isBlockedByMe || amIBlocked || !auth.currentUser || isSending || myLiveStatus?.isMuted) return;
    
    const originalInput = inputText;
    setInputText(''); 
    setIsSending(true);

    try {
      const dmPath = `private_messages/${chatId}`;
      const dmRef = ref(rtdb, dmPath);
      const newMessageRef = push(dmRef);
      const timestamp = serverTimestamp();
      
    const effectiveSenderUid = isDev ? 'dev_admin_account_lm656508' : auth.currentUser.uid;
    const payload = {
      text: type === 'text' ? text : `تفضل بزيارة غرفتي الخاصة: ${myRoom?.name || 'مجلستي'} ✨🎪`,
      type,
      roomId: type === 'private_room_invite' ? myRoom?.id : null,
      roomName: type === 'private_room_invite' ? myRoom?.name : null,
      uid: effectiveSenderUid,
      displayName: myLiveStatus?.displayName || auth.currentUser.displayName || (isDev ? 'دودي-Dody 👑' : 'عضو ملكي'),
      photoURL: myLiveStatus?.photoURL || auth.currentUser.photoURL || (isDev ? `https://api.dicebear.com/7.x/initials/svg?seed=Dody` : `https://api.dicebear.com/7.x/initials/svg?seed=${auth.currentUser.displayName || 'User'}`),
      membership: myLiveStatus?.membership || (isDev ? 'famous' : null),
      isVip: myLiveStatus?.isVip || isDev,
      isManager: isDev,
      timestamp
    };

      // Atomic write for instant sync across all global nodes
      await set(newMessageRef, payload);

      const metaRef = ref(rtdb, `user_dms/${auth.currentUser.uid}/${targetIdForMetadata}`);
      const targetMetaRef = ref(rtdb, `user_dms/${targetIdForMetadata}/${auth.currentUser.uid}`);
      
      const lastMsgText = type === 'private_room_invite' ? '🎪 دعوة لغرفة خاصة' : text;

      const metaData = {
        uid: targetIdForMetadata,
        displayName: targetLiveStatus?.displayName || targetUser.displayName || 'عضو ملكي',
        photoURL: targetLiveStatus?.photoURL || targetUser.photoURL || '',
        lastMessage: lastMsgText,
        timestamp
      };

      const targetMetaData = {
        uid: auth.currentUser.uid,
        displayName: myLiveStatus?.displayName || auth.currentUser.displayName || (isDev ? 'دودي-Dody 👑' : 'عضو ملكي'),
        photoURL: myLiveStatus?.photoURL || auth.currentUser.photoURL || '',
        lastMessage: lastMsgText,
        timestamp
      };

      // Swift metadata updates
      update(metaRef, metaData);
      get(targetMetaRef).then((snap) => {
        const existing = snap.val() || {};
        update(targetMetaRef, {
          ...targetMetaData,
          unreadCount: (existing.unreadCount || 0) + 1
        });
      });
      
    } catch (err: any) {
      console.error("Private message error:", err);
      setInputText(originalInput); // Rollback locally on error
    } finally {
      setIsSending(false);
    }
  };

  const grantRank = async (type: 'famous' | 'influencer' | 'premium') => {
    const targetUid = targetUser.uid;
    const userRef = ref(rtdb, `users/${targetUid}`);
    setIsGranting(type);
    update(userRef, { isVip: true, membership: type, role: type }).then(async () => {
      setGrantSuccess(true);
      try {
        await setDoc(doc(db, 'users', targetUid), { isVip: true, membership: type, role: type, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${targetUid}`);
      }
      setTimeout(() => {
        setGrantSuccess(false);
        setIsGranting(null);
        setShowGrantMenu(false);
      }, 1500);
    });
  };

  useEffect(() => {
    if (initialMessage && !initialSent.current && chatId) {
      initialSent.current = true;
      sendMessage(initialMessage);
    }
  }, [initialMessage, chatId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleBlock = async () => {
    if (!auth.currentUser) return;
    const blockRef = ref(rtdb, `blocks/${auth.currentUser.uid}/${targetUser.uid}`);
    if (isBlockedByMe) {
      await remove(blockRef);
    } else {
      await set(blockRef, true);
    }
    setShowMenu(false);
  };

  const handleDeleteChat = async () => {
    if (confirm('هل أنت متأكد من حذف هذه المحادثة من الطرفين نهائياً؟')) {
      onBack();
      try {
        await remove(ref(rtdb, `private_messages/${chatId}`));
        await remove(ref(rtdb, `user_dms/${myId}/${targetIdForMetadata}`));
        await remove(ref(rtdb, `user_dms/${targetIdForMetadata}/${myId}`));
      } catch (err) {
        console.error("Delete failed", err);
      }
    }
  };

  const deleteMessageForEveryone = async (messageId: string) => {
    const msgRef = ref(rtdb, `private_messages/${chatId}/${messageId}`);
    try {
      await remove(msgRef);
    } catch (err) {
      console.error("Delete message error:", err);
    }
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 h-[100dvh] z-[60] bg-[#05070a] flex flex-col font-arabic" 
      dir="rtl"
    >
      <header className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-white/5 bg-[#0a0f18]/80 backdrop-blur-xl relative z-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full text-white">
            <ChevronLeft className="w-5 h-5 rotate-180" />
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onOpenProfile?.({ 
                uid: targetIdForMetadata,
                displayName: targetFirestoreProfile?.displayName || targetLiveStatus?.displayName || targetUser.displayName,
                photoURL: targetFirestoreProfile?.photoURL || targetLiveStatus?.photoURL || targetUser.photoURL
              })}
              className="relative active:scale-95 transition-transform"
            >
              <img src={targetFirestoreProfile?.photoURL || targetLiveStatus?.photoURL || targetUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${targetUser.displayName}`} className="w-9 h-9 rounded-full border border-white/10" alt="target" />
            </button>
            <div 
              className="cursor-pointer hover:opacity-80 transition-opacity" 
              onClick={() => onOpenProfile?.({ uid: targetIdForMetadata })}
            >
              <span className="text-sophisticated-gold text-[7px] font-black tracking-[0.2em] uppercase opacity-70 block mb-0.5">شاتنا - CHATNA</span>
              <h3 className="text-sm font-bold text-white">
                {targetFirestoreProfile?.displayName || targetLiveStatus?.displayName || targetUser.displayName || 'عضو ملكي'}
              </h3>
            </div>
          </div>
        </div>
        
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-white/5 rounded-full">
            <MoreVertical className="w-5 h-5 text-gray-400" />
          </button>
          <AnimatePresence>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="absolute left-0 mt-2 w-48 bg-[#0a0f18]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <button onClick={handleBlock} className={`w-full flex items-center gap-3 px-4 py-3 text-right ${isBlockedByMe ? 'text-green-500' : 'text-red-500'}`}>
                    <Ban className="w-4 h-4" />
                    <span className="text-xs font-bold">{isBlockedByMe ? 'إلغاء الحظر' : 'حظر المستخدم'}</span>
                  </button>
                  <button onClick={handleDeleteChat} className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 text-right">
                    <Trash2 className="w-4 h-4" />
                    <span className="text-xs font-bold">حذف المحادثة</span>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 pb-[120px] space-y-6 bg-gradient-to-b from-[#0a0f18] to-[#05070a]">
        {loading && (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-indigo-500 animate-spin mb-2 mx-auto" />
            <p className="text-[10px] text-gray-400 font-bold">جاري تحديث المحادثة...</p>
          </div>
        )}

        {messages.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-30 font-arabic">
            <MessageSquare className="w-12 h-12 mb-3 text-indigo-400" />
            <p className="text-sm font-bold">المحادثة فارغة</p>
            <p className="text-[10px]">ابدأ بمراسلة هذا العضو الملكي</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.uid === myId;
            const userProfile = isMe ? myFirestoreProfile : targetFirestoreProfile;
            const isFamous = userProfile?.membership === 'famous' || msg.uid === realAdminUid;
            const isInvite = msg.type === 'private_room_invite';

            return (
              <motion.div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2 group/msg`}>
                {!isMe && (
                  <button 
                    onClick={() => {
                      const isMe = msg.uid === myId;
                      const profile = isMe ? myFirestoreProfile : targetFirestoreProfile;
                      onOpenProfile?.({ 
                        uid: msg.uid,
                        displayName: profile?.displayName || msg.displayName,
                        photoURL: profile?.photoURL || msg.photoURL
                      });
                    }}
                    className="shrink-0 active:scale-95 transition-transform"
                  >
                    <img 
                      src={targetFirestoreProfile?.photoURL || msg.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.displayName || 'User'}`} 
                      className="w-8 h-8 rounded-full border border-white/5" 
                    />
                  </button>
                )}
                <div className="flex flex-col gap-1 max-w-[85%]">
                  <div 
                    className={`flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'} cursor-pointer hover:underline`}
                    onClick={() => onOpenProfile?.({ uid: msg.uid })}
                  >
                    <span className={`
                      text-[11px] font-bold
                      ${isFamous ? 'text-amber-500' : 'text-gray-500'}
                      ${((userProfile?.role || userProfile?.membership || msg.membership) === 'premium') ? '!text-amber-400' : ''}
                      ${((userProfile?.role || userProfile?.membership || msg.membership) === 'influencer') ? '!text-green-400' : ''}
                      ${(isFamous || (userProfile?.role || userProfile?.membership || msg.membership) === 'famous') ? '!text-red-500' : ''}
                    `}>
                      {userProfile?.displayName || msg.displayName || (isFamous ? 'دودي-Dody 👑' : 'عضو ملكي')}
                    </span>
                    {isFamous && <Crown className="w-3 h-3 text-amber-500" />}
                  </div>
                  
                  {isInvite ? (
                    <motion.div 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => msg.roomId && onEnterRoom?.(msg.roomId)}
                      className="p-1 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 shadow-[0_0_30px_rgba(245,158,11,0.2)] cursor-pointer overflow-hidden relative group"
                    >
                      <div className="bg-[#0a0f18] rounded-[0.9rem] p-4 flex flex-col items-center gap-3 border border-white/10">
                        <div className="relative">
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                            className="w-16 h-16 rounded-full border-2 border-dashed border-amber-500/50 absolute inset-0"
                          />
                          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center relative z-10">
                            <MapPin className="w-8 h-8 text-amber-500 animate-bounce" />
                          </div>
                        </div>
                        <div className="text-center">
                          <h4 className="text-sm font-black text-amber-500 tracking-wider"><span>دعوة لدخول الغرفة الملكية</span></h4>
                          <p className="text-[11px] text-gray-400 mt-1"><span>{msg.roomName}</span></p>
                        </div>
                        <div className="w-full bg-amber-500 py-2 rounded-xl text-center text-[#0a0f18] font-black text-xs group-hover:bg-amber-400 transition-colors">
                          <span>انقر للدخول الآن 🎪</span>
                        </div>
                      </div>
                      <motion.div 
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
                      />
                    </motion.div>
                  ) : (
                    <div className={`
                      p-3 px-4 rounded-2xl text-[14px] leading-relaxed shadow-lg border relative
                      ${isMe 
                          ? 'bg-indigo-600 border-indigo-400/30 text-white rounded-br-sm' 
                          : 'bg-[#1e293b] border-white/5 text-gray-200 rounded-bl-sm'
                      }
                      ${((userProfile?.role || userProfile?.membership || msg.membership) === 'premium') ? 'neon-gold-glow !bg-[#1a1005] !border-[#ff9900]/20' : ''}
                      ${((userProfile?.role || userProfile?.membership || msg.membership) === 'influencer') ? 'neon-green-glow !bg-[#051a0a] !border-[#39ff14]/20' : ''}
                      ${(isFamous || (userProfile?.role || userProfile?.membership || msg.membership) === 'famous') ? 'neon-red-glow !bg-[#0a0505] !border-[#ff0000]/30 font-bold' : ''}
                    `}>
                      {msg.text}
                      {(isMe || isDev) && (
                        <button onClick={() => deleteMessageForEveryone(msg.id)} className="absolute -top-2 -right-10 p-1.5 bg-red-600 text-white rounded-lg opacity-0 group-hover/msg:opacity-100 transition-opacity">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={scrollRef} />
      </div>

      <div className="fixed bottom-0 left-0 w-full p-4 bg-[#0a0f18] border-t border-white/5 z-[100] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        {myLiveStatus?.isMuted ? (
          <div className="bg-red-500/10 p-3 rounded-2xl text-center"><p className="text-xs text-red-500 font-bold">أنت مكتوم حالياً ⚠️</p></div>
        ) : isBlockedByMe || amIBlocked ? (
          <div className="bg-red-500/10 p-3 rounded-2xl text-center"><p className="text-xs text-red-500 font-bold">{amIBlocked ? 'لقد تم حظرك' : 'لقد قمت بالحظر'}</p></div>
        ) : (
          <div className="flex items-center gap-2">
            {(isDev || myLiveStatus?.membership === 'famous') && (
              <div className="flex gap-2">
                {isDev && (
                  <button onClick={() => setShowGrantMenu(!showGrantMenu)} className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center">
                    <Crown className="w-5 h-5" />
                  </button>
                )}
                {myRoom && (
                  <button 
                    onClick={() => sendMessage('', 'private_room_invite')}
                    className="w-10 h-10 bg-indigo-500/10 text-indigo-500 rounded-xl flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                    title="مشاركة غرفتي الملكية"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
            
            <AnimatePresence>
              {showGrantMenu && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: -180 }} exit={{ opacity: 0 }} className="absolute bottom-20 right-4 bg-[#0f172a] border border-amber-500/30 p-3 rounded-2xl z-[100] flex flex-col gap-2 min-w-[160px] shadow-2xl">
                  {['famous', 'influencer', 'premium'].map((r: any) => (
                    <button key={r} onClick={() => grantRank(r)} disabled={isGranting !== null} className="w-full p-2.5 text-[11px] font-black text-amber-500 bg-amber-500/5 rounded-xl border border-amber-500/10 hover:bg-amber-500 hover:text-white transition-all flex items-center justify-center gap-1">
                      {isGranting === r ? 'جاري المنح...' : grantSuccess && isGranting === r ? 'تم المنح ✅' : `منح رتبة ${r === 'famous' ? 'مشهور' : r === 'influencer' ? 'مؤثر' : 'مميز'}`}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex-1 flex items-center bg-[#05070a] border border-white/5 rounded-2xl p-1 px-3 h-11">
              <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputText)} placeholder="اكتب رسالة..." className="flex-1 bg-transparent border-none outline-none text-white text-sm" />
              <button onClick={() => { sendMessage(inputText); setInputText(''); }} disabled={!inputText.trim()} className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg disabled:opacity-50">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
