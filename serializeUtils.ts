/**
 * Safely stringifies an object by picking only serializable primitive fields.
 * This prevents "JSON.stringify cannot serialize cyclic structures" and
 * avoids issues with complex SDK objects like FieldValue or Timestamp.
 */
export function safePickUserData(data: any) {
  if (!data) return null;
  return {
    uid: typeof data.uid === 'string' ? data.uid : '',
    email: typeof data.email === 'string' ? data.email : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : '',
    username: typeof data.username === 'string' ? data.username : '',
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
    isVip: typeof data.isVip === 'boolean' ? data.isVip : false,
    membership: typeof data.membership === 'string' ? data.membership : 'none',
    role: typeof data.role === 'string' ? data.role : 'none',
    isBanned: typeof data.isBanned === 'boolean' ? data.isBanned : false,
    isMuted: typeof data.isMuted === 'boolean' ? data.isMuted : false,
    lastSeen: typeof data.lastSeen === 'number' ? data.lastSeen : Date.now(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()
  };
}

export function safeJsonStringify(obj: any): string {
  try {
    const cache: any[] = [];
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.indexOf(value) !== -1) {
          // Circular reference found, discard key
          return;
        }
        // Store value in our collection
        cache.push(value);
      }
      return value;
    });
  } catch (err) {
    console.warn("Failed safe serialization, using picking instead", err);
    return JSON.stringify({ error: 'Serialization failed' });
  }
}
