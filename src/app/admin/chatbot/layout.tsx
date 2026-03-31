/**
 * Sidebar-free layout for /admin/chatbot — designed for iframe embedding in Softr.
 * Overrides the parent /admin layout so the nav doesn't appear.
 */
export default function ChatbotEmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      {children}
    </div>
  );
}
