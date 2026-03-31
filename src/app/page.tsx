import { redirect } from 'next/navigation';

// Root page — redirect to admin dashboard
export default function RootPage() {
  redirect('/admin');
}
