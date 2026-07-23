import { useEffect, useState } from 'react';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToAgentMessages } from './agentMessagesSubscription';
import { countUnreadInbound } from './messageUtils';

/**
 * Lightweight real-time unread count for shell badges.
 */
export default function useUnreadMessages() {
  const { currentUser } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentUser?.uid) {
      setUnreadCount(0);
      return undefined;
    }

    return subscribeToAgentMessages(
      db,
      { agentUid: currentUser.uid, agentEmail: currentUser.email || null },
      {
        onData: (messages) => setUnreadCount(countUnreadInbound(messages)),
        onError: () => setUnreadCount(0),
      }
    );
  }, [currentUser?.uid]);

  return unreadCount;
}
