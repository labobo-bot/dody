import React, { useState } from 'react';
import { signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider, rtdb, db } from '../firebase';
import { MessageCircle, Sparkles, ShieldCheck, MailQuestion } from 'lucide-react';
import { motion } from 'motion/react';
import { ref, get, update, serverTimestamp } from 'firebase/database';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { safePickUserData, safeJsonStringify } from '../lib/serializeUtils';

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  React.useEffect(() => {
    // 1. المستمع النشط لحالة الحساب (onAuthStateChanged)
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        console.log("تم اكتشاف دخول مستخدم بالفعل ✅");
        setSuccess("أهلاً بك مجدداً! جاري الدخول للقاعات الملكية...");
        setIsLoggingIn(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const syncGoogleUser = async (user: import('firebase/auth').User) => {
    const isDev = user.email === 'lm656508@gmail.com';
    const effectiveUid = isDev ? 'dev_admin_account_lm656508' : user.uid;
    
    try {
      setSuccess("جاري مزامنة بياناتك الملكية... 🔄");
      const userRefRtdb = ref(rtdb, `users/${effectiveUid}`);
      const userDocRef = doc(db, 'users', effectiveUid);
      let userDocFirestore = null;
      try {
        userDocFirestore = await getDoc(userDocRef);
      } catch (err) {
        console.warn("Could not fetch userDoc from Firestore on login, proceeding with default sync:", err);
      }
      const snap = await get(userRefRtdb);
      
      const firestoreData = (userDocFirestore && userDocFirestore.exists()) ? userDocFirestore.data() : {};
      const rtdbData = (snap.exists() ? snap.val() : {}) as Record<string, unknown>;
      const existingData = { ...rtdbData, ...firestoreData };

      const defaultUsername = isDev ? 'aa' : `u${effectiveUid.substring(0, 5)}`.toLowerCase();
      
      const userData = {
        uid: effectiveUid,
        email: user.email || (existingData.email as string) || '',
        displayName: (existingData.displayName as string) || (isDev ? 'دودي-Dody 👑' : (user.displayName || 'عضو ملكي')),
        photoURL: (existingData.photoURL as string) || user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || 'User'}`,
        username: (existingData.username as string) || defaultUsername,
        createdAt: (existingData.createdAt as string) || new Date().toISOString(),
        isVip: isDev || (existingData.isVip as boolean) || false,
        membership: isDev ? ((existingData.membership as string) || 'famous') : ((existingData.membership as string) || 'none'),
        role: isDev ? ((existingData.role as string) || 'famous') : ((existingData.role as string) || (existingData.membership as string) || 'none'),
        status: 'online',
        emailVerified: true,
        lastSeen: serverTimestamp()
      };
      
      // Separate Firestore payload to strip RTDB-specific serverTimestamp
      const firestoreUserData = {
        ...userData,
        lastSeen: new Date().toISOString()
      };

      await Promise.all([
        update(userRefRtdb, userData),
        (async () => {
          try {
            await setDoc(doc(db, 'users', effectiveUid), firestoreUserData, { merge: true });
          } catch (err) {
            console.error("Failed to set user document in Firestore on login:", err);
          }
        })()
      ]);

      // Update local cache defensively to avoid cyclic structure errors
      const cacheData = safePickUserData(userData);
      window.localStorage.setItem(`user_data_${effectiveUid}`, safeJsonStringify(cacheData));

      console.log("تمت مزامنة البيانات الملكية بنجاح ✅");
      setSuccess("تم الدخول بنجاح! يتم الآن الانتقال للقاعات... 🎪");
    } catch {
      // Even if sync fails, we let them through if they are authed
      setSuccess("تم تسجيل الدخول!");
    }
  };

  const handleGoogleSignIn = async () => {
    if (isLoggingIn) return;
    
    setError(null);
    setSuccess(null);
    setIsLoggingIn(true);
    auth.languageCode = 'ar';

    try {
      console.log("بدء عملية تسجيل الدخول عبر Google Popup...");
      const result = await signInWithPopup(auth, googleProvider);
      
      if (result && result.user) {
        console.log("نجح تسجيل الدخول، بدء المزامنة...");
        await syncGoogleUser(result.user);
      }
    } catch (err: unknown) {
      console.error("Sign In Error:", err);
      const errorData = err as any;
      if (errorData.code === 'auth/popup-blocked') {
        setError("يرجى السماح بالنوافذ المنبثقة (Popups) في متصفحك لتتمكن من تسجيل الدخول ⚠️");
      } else if (errorData.code === 'auth/cancelled-popup-request') {
        setError("تم إلغاء عملية تسجيل الدخول.");
      } else if (errorData.code === 'auth/unauthorized-domain') {
        const hostname = window.location.hostname;
        setError(`هذا النطاق (${hostname}) غير مصرح به. 
1. تأكد من إضافته في إعدادات Authentication > Settings > Authorized domains في Firebase.
2. تأكد من عدم وجود قيود (Restrictions) على مفتاح الـ API في GCP Console تمنع هذا النطاق. ⚠️`);
      } else {
        setError(`فشل تسجيل الدخول: ${errorData.message || errorData.code}`);
      }
      setIsLoggingIn(false);
    }
    // Note: We don't set isLoggingIn to false here if successful, 
    // because onAuthStateChanged or the sync will complete the flow.
  };

  return (
    <div className="min-h-screen bg-[#05070a] flex flex-col items-center justify-center p-6 text-white relative overflow-hidden font-arabic" dir="rtl">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-orange-600/10 rounded-full blur-[160px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-red-600/10 rounded-full blur-[160px] animate-pulse" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full flex flex-col items-center text-center relative z-10"
      >
        <div className="relative mb-8 group">
          <motion.div className="w-24 h-24 bg-gradient-to-br from-orange-400 to-red-600 rounded-[2.5rem] flex items-center justify-center shadow-[0_0_60px_rgba(249,115,22,0.4)]">
            <MessageCircle className="w-12 h-12 text-white" />
          </motion.div>
        </div>

        <h1 className="text-5xl font-black mb-2 tracking-tighter bg-gradient-to-b from-white to-gray-500 bg-clip-text text-transparent">دودي</h1>
        <p className="text-gray-500 mb-8 text-sm font-bold tracking-widest flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-400" />
          تطبيق دردشة عربي
        </p>

        <div className="w-full bg-[#161b33]/40 p-8 rounded-[2.5rem] border border-white/5 backdrop-blur-xl shadow-2xl">
          <div className="mb-8">
            <h2 className="text-xl font-black text-white">الدخول إلى تطبيق دودي</h2>
            <p className="text-gray-500 text-xs mt-2 font-bold leading-relaxed">سجل دخول إلى الدردشة العربية</p>
          </div>

          <div className="space-y-6">
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-red-400 text-xs text-right bg-red-500/5 p-4 rounded-2xl border border-red-500/10 leading-relaxed"
              >
                {error}
              </motion.div>
            )}
            
            {success && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-green-400 text-xs text-right bg-green-500/5 p-4 rounded-2xl border border-green-500/10"
              >
                {success}
              </motion.div>
            )}

            <button 
              type="button" 
              onClick={handleGoogleSignIn}
              disabled={isLoggingIn} 
              className="w-full bg-white text-[#05070a] py-5 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-3 transition-all hover:bg-gray-100 active:scale-95 shadow-[0_10px_40px_rgba(255,255,255,0.1)] disabled:opacity-50"
            >
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
              ) : (
                <>
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="google" />
                  <span>تسجيل دخول عبر جوجل</span>
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-4">
              <button 
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoggingIn}
                className="bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl text-[10px] font-bold transition-all text-gray-400 hover:text-white"
              >
                إنشاء حساب عبر جوجل
              </button>
              <button 
                type="button"
                onClick={() => window.open('https://accounts.google.com/signin/recovery', '_blank')}
                className="bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl text-[10px] font-bold transition-all text-gray-400 hover:text-white"
              >
                نسيت كلمة السر
              </button>
            </div>

            <p className="text-[10px] text-gray-600 font-bold text-center px-4 leading-relaxed uppercase tracking-wider">
              بالتوقيع الرقمي، أنت توافق على قوانين منصة دودي الملكية وسياسة الخصوصية العالمية.
            </p>
          </div>
        </div>

        <div className="mt-12 flex items-center gap-6 text-white/10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-orange-400/50" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">بصمة أمان</span>
          </div>
          <div className="w-px h-6 bg-white/5" />
          <div className="flex items-center gap-2">
            <MailQuestion className="w-5 h-5 text-orange-400/50" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">توثيق إلزامي</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
