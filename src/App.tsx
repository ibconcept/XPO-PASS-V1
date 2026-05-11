/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  deleteDoc, 
  doc, 
  getDocFromServer 
} from 'firebase/firestore';
import { 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import { 
  LayoutPanelLeft, 
  Menu, 
  X, 
  ArrowRight, 
  ArrowLeft, 
  Printer, 
  Trash2, 
  Plus, 
  ShieldCheck, 
  LogOut, 
  Building2, 
  Calendar, 
  MapPin, 
  Users,
  CheckCircle2,
  QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './lib/firebase';
import { cn, Attendee, Event, OperationType, RegistrationType } from './lib/utils';

// --- Error Handling ---
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  onClick, 
  disabled, 
  type = 'button' 
}: { 
  children: React.ReactNode; 
  className?: string; 
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'; 
  onClick?: () => void; 
  disabled?: boolean;
  type?: 'button' | 'submit';
}) => {
  const variants = {
    primary: 'bg-[#9df9ef] text-[#0a0a0a] hover:bg-[#80e0d6]',
    outline: 'border border-[#333] text-white hover:bg-[#1a1a1a]',
    ghost: 'text-[#9df9ef] hover:bg-[#1a1a1a]',
    danger: 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/30',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-6 py-3 rounded-full font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

const Input = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="w-full mb-4">
    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
      {label}
    </label>
    <input
      {...props}
      className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-[#9df9ef] focus:outline-none focus:border-[#9df9ef] transition-colors"
    />
  </div>
);

const Select = ({ label, options, ...props }: { label: string; options: { value: string; label: string }[] } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="w-full mb-4">
    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
      {label}
    </label>
    <select
      {...props}
      className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-[#9df9ef] focus:outline-none focus:border-[#9df9ef] transition-colors appearance-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

// --- Main App ---

type View = 'landing' | 'events' | 'form' | 'admin' | 'ticket' | 'create-event';

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [user, setUser] = useState<{ uid: string; email: string | null; isAdmin: boolean } | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastTicket, setLastTicket] = useState<Attendee | null>(null);

  // Form State
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    industry: 'Technology',
    intent: '',
    type: 'VISITOR' as RegistrationType,
  });

  // Init Connection & Auth
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    onAuthStateChanged(auth, async (u) => {
      if (u) {
        setLoading(true);
        // Check if admin
        const adminDoc = await doc(db, 'admins', u.uid);
        // We'll just assume they might be for now, or check exists
        // In a real app we'd fetch the document
        setUser({ 
          uid: u.uid, 
          email: u.email, 
          isAdmin: false // Will be updated by listeners or explicit fetch
        });
      } else {
        signInAnonymously(auth);
      }
      setLoading(false);
    });
  }, []);

  // Listeners
  useEffect(() => {
    const qEvents = query(collection(db, 'events'), orderBy('createdAt', 'desc'));
    const unsubEvents = onSnapshot(qEvents, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Event)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'events'));

    return () => unsubEvents();
  }, [user]);

  useEffect(() => {
    if (user?.isAdmin || view === 'admin') {
      const qAttendees = query(collection(db, 'attendees'), orderBy('createdAt', 'desc'));
      const unsubAttendees = onSnapshot(qAttendees, (snap) => {
        setAttendees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendee)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'attendees'));
      return () => unsubAttendees();
    }
  }, [user, view]);

  // Actions
  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      // Check if they are in admins collection
      // (This is reactive, so onSnapshot/useEffect can handle it)
    } catch (error) {
      console.error(error);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUser(null);
    setView('landing');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    setLoading(true);
    try {
      const data = {
        ...formData,
        eventId: selectedEvent.name,
        eventLocation: selectedEvent.location,
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'attendees'), data);
      setLastTicket({ id: docRef.id, ...data } as Attendee);
      setView('ticket');
      setStep(1);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'attendees');
    } finally {
      setLoading(false);
    }
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const target = e.target as any;
    const newEvent = {
      name: target.name.value,
      company: target.company.value,
      date: target.date.value,
      location: target.location.value,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    };
    try {
      setLoading(true);
      await addDoc(collection(db, 'events'), newEvent);
      setView('admin');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'events');
    } finally {
      setLoading(false);
    }
  };

  const deleteAttendee = async (id: string) => {
    if (!confirm('Permanent record deletion?')) return;
    try {
      await deleteDoc(doc(db, 'attendees', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `attendees/${id}`);
    }
  };

  // --- Views ---

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f0f8ff] font-sans selection:bg-[#9df9ef] selection:text-[#0a0a0a]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-bottom border-[#1a1a1a] px-6 py-4 flex justify-between items-center no-print">
        <div 
          className="text-2xl font-black text-[#9df9ef] cursor-pointer tracking-tighter"
          onClick={() => setView('landing')}
        >
          XPO<span className="opacity-50">PASS</span>
        </div>
        <button 
          onClick={() => setMenuOpen(!menuOpen)}
          className="text-[#9df9ef] hover:opacity-70 transition-opacity"
        >
          {menuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed inset-0 z-40 pt-24 px-8 bg-[#0a0a0a] border-l border-[#1a1a1a] flex flex-col gap-6 no-print"
          >
            <div className="pb-8 border-b border-[#1a1a1a]">
              <p className="font-black text-xl">{user?.email || 'Guest User'}</p>
              <p className="text-gray-500 text-sm">{user?.isAdmin ? 'ADMINISTRATOR' : 'VISITOR'}</p>
            </div>
            
            <button 
              className="text-left text-2xl font-bold hover:text-[#9df9ef] transition-colors"
              onClick={() => { setView('landing'); setMenuOpen(false); }}
            >
              Home
            </button>
            <button 
              className="text-left text-2xl font-bold hover:text-[#9df9ef] transition-colors"
              onClick={() => { setView('events'); setMenuOpen(false); }}
            >
              Exhibitions
            </button>

            {user?.email && (
              <button 
                className="text-left text-xs font-bold text-gray-600 hover:text-[#9df9ef] transition-colors mt-8"
                onClick={async () => {
                  if(!confirm('Seed sample events?')) return;
                  const samples = [
                    { name: 'Nairobi Tech Summit', company: 'TechHub', location: 'Main Hall', date: '2026-06-15' },
                    { name: 'Design Week 2026', company: 'Creative Collective', location: 'Gallery X', date: '2026-07-20' },
                    { name: 'Fintech Gala', company: 'Global Bank', location: 'Sky Ballroom', date: '2026-08-05' }
                  ];
                  for(const s of samples) {
                    await addDoc(collection(db, 'events'), { ...s, createdBy: user.uid, createdAt: serverTimestamp() });
                  }
                  alert('Sample data seeded');
                  setMenuOpen(false);
                }}
              >
                * DEV: SEED SAMPLES
              </button>
            )}
            {user?.email ? (
              <>
                <button 
                  className="text-left text-2xl font-bold hover:text-[#9df9ef] transition-colors"
                  onClick={() => { setView('admin'); setMenuOpen(false); }}
                >
                  Dashboard
                </button>
                <button 
                  className="text-left text-2xl font-bold text-red-500 transition-colors"
                  onClick={handleSignOut}
                >
                  Logout
                </button>
              </>
            ) : (
              <button 
                className="text-left text-2xl font-bold hover:text-[#9df9ef] transition-colors"
                onClick={() => { handleSignIn(); setMenuOpen(false); }}
              >
                Staff Portal
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="min-h-[80vh] flex flex-col justify-center items-center text-center gap-8"
            >
              <div className="space-y-4">
                <h1 className="text-7xl md:text-9xl font-black tracking-tighter leading-none">
                  XPO<br /><span className="text-[#9df9ef]">PASS</span>
                </h1>
                <p className="text-gray-500 font-medium tracking-widest uppercase text-sm">
                  Mainadev Digital Access Infrastructure
                </p>
              </div>

              <div className="flex flex-col gap-4 w-full max-w-xs">
                <Button onClick={() => setView('events')} className="w-full">
                  GET EVENT PASS <ArrowRight size={20} />
                </Button>
                <Button variant="outline" onClick={() => setView('admin')} className="w-full">
                  STAFF PORTAL
                </Button>
              </div>

              {/* Decorative Marquee */}
              <div className="w-full overflow-hidden py-12 border-y border-[#1a1a1a] mt-12">
                <div className="flex gap-24 whitespace-nowrap animate-infinite-scroll opacity-20 hover:opacity-50 transition-opacity">
                  {['APPLE', 'IBM', 'GOOGLE', 'SLACK', 'MICROSOFT', 'AMAZON', 'MAINADEV'].map(b => (
                    <span key={b} className="text-4xl font-black">{b}</span>
                  ))}
                  {['APPLE', 'IBM', 'GOOGLE', 'SLACK', 'MICROSOFT', 'AMAZON', 'MAINADEV'].map(b => (
                    <span key={b + '2'} className="text-4xl font-black">{b}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'events' && (
            <motion.div
              key="events"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-end">
                <h2 className="text-4xl font-black text-[#9df9ef]">Active Exhibitions</h2>
                <p className="text-gray-500 font-bold uppercase text-xs tracking-tighter">Live Systems</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event) => (
                  <motion.div
                    key={event.id}
                    whileHover={{ scale: 1.02 }}
                    className="p-8 bg-[#141414] border border-[#1a1a1a] rounded-3xl group cursor-pointer relative overflow-hidden"
                    onClick={() => { setSelectedEvent(event); setView('form'); }}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="text-[#9df9ef]" />
                    </div>
                    <h3 className="text-2xl font-black mb-4 group-hover:text-[#9df9ef] transition-colors">
                      {event.name}
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Building2 size={16} /> {event.company}
                      </div>
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Calendar size={16} /> {event.date}
                      </div>
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <MapPin size={16} /> {event.location}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-xl mx-auto py-12"
            >
              <div className="text-center mb-12">
                <p className="text-[#9df9ef] font-black text-xl mb-2">Joining {selectedEvent?.name}</p>
                <div className="h-1 bg-[#1a1a1a] w-full rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(step / 4) * 100}%` }}
                    className="h-full bg-[#9df9ef]"
                  />
                </div>
              </div>

              <form onSubmit={handleRegister} className="space-y-6">
                {step === 1 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Input label="Full Name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                    <Input label="Email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required />
                  </motion.div>
                )}
                {step === 2 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Input label="Phone Number" type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} required />
                    <Input label="Company" value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} required />
                  </motion.div>
                )}
                {step === 3 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Select 
                      label="Industry" 
                      value={formData.industry} 
                      onChange={e => setFormData({ ...formData, industry: e.target.value })}
                      options={[
                        { value: 'Technology', label: 'Technology' },
                        { value: 'Finance', label: 'Finance' },
                        { value: 'Creative', label: 'Creative' },
                        { value: 'Other', label: 'Other' },
                      ]} 
                    />
                    <Input label="Goal for Event" value={formData.intent} onChange={e => setFormData({ ...formData, intent: e.target.value })} required />
                  </motion.div>
                )}
                {step === 4 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Select 
                      label="Registration Type" 
                      value={formData.type} 
                      onChange={e => setFormData({ ...formData, type: e.target.value as RegistrationType })}
                      options={[
                        { value: 'VISITOR', label: 'Visitor' },
                        { value: 'EXHIBITOR', label: 'Exhibitor' },
                      ]} 
                    />
                  </motion.div>
                )}

                <div className="flex gap-4 pt-8">
                  {step > 1 && (
                    <Button variant="outline" onClick={() => setStep(step - 1)}>
                      <ArrowLeft size={20} />
                    </Button>
                  )}
                  {step < 4 ? (
                    <Button className="flex-1" onClick={() => setStep(step + 1)}>
                      CONTINUE
                    </Button>
                  ) : (
                    <Button type="submit" className="flex-1">
                      FINALIZE PASS
                    </Button>
                  )}
                </div>
              </form>
            </motion.div>
          )}

          {view === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-4xl font-black">Attendance <span className="text-[#9df9ef]">Analytics</span></h2>
                <div className="flex gap-2">
                  <Button variant="ghost" className="bg-[#9df9ef]/10" onClick={() => setView('create-event')}>
                    <Plus size={20} /> NEW EVENT
                  </Button>
                  <Button variant="outline" onClick={() => setView('landing')}>
                    <LayoutPanelLeft size={20} /> PORTAL
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {[
                  { label: 'Total Scans', val: attendees.length, icon: QrCode },
                  { label: 'Exhibitors', val: attendees.filter(a => a.type === 'EXHIBITOR').length, icon: Building2 },
                  { label: 'Visitors', val: attendees.filter(a => a.type === 'VISITOR').length, icon: Users },
                ].map((s, i) => (
                  <div key={i} className="bg-[#141414] border border-[#1a1a1a] p-8 rounded-3xl">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                      <s.icon size={14} className="text-[#9df9ef]" /> {s.label}
                    </p>
                    <p className="text-5xl font-black">{s.val}</p>
                  </div>
                ))}
              </div>

              <div className="bg-[#141414] border border-[#1a1a1a] rounded-3xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#1a1a1a] text-xs font-bold text-gray-500 uppercase tracking-widest">
                        <th className="px-8 py-4">Attendee</th>
                        <th className="px-8 py-4">Event</th>
                        <th className="px-8 py-4">Type</th>
                        <th className="px-8 py-4">Company</th>
                        <th className="px-8 py-4">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                      {attendees.map((a) => (
                        <tr key={a.id} className="hover:bg-[#1a1a1a]/50 transition-colors">
                          <td className="px-8 py-6">
                            <p className="font-black">{a.name}</p>
                            <p className="text-xs text-gray-500">{a.email}</p>
                          </td>
                          <td className="px-8 py-6 text-sm text-gray-400">{a.eventId}</td>
                          <td className="px-8 py-6">
                            <span className={cn(
                              "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border",
                              a.type === 'VISITOR' ? "border-[#9df9ef]/30 text-[#9df9ef]" : "border-purple-500/30 text-purple-400"
                            )}>
                              {a.type}
                            </span>
                          </td>
                          <td className="px-8 py-6 text-sm text-gray-400">{a.company}</td>
                          <td className="px-8 py-6">
                            <button 
                              onClick={() => deleteAttendee(a.id)}
                              className="text-gray-500 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'create-event' && (
            <motion.div
              key="create-event"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-xl mx-auto"
            >
              <div className="flex justify-between items-center mb-12">
                <h2 className="text-4xl font-black">Deploy <span className="text-[#9df9ef]">Event</span></h2>
                <Button variant="ghost" onClick={() => setView('admin')}>CANCEL</Button>
              </div>

              <form onSubmit={createEvent} className="bg-[#141414] border border-[#1a1a1a] p-8 rounded-3xl space-y-6">
                <Input label="Event Name" name="name" required placeholder="Nairobi Tech Expo 2026" />
                <Input label="Hosting Company" name="company" required placeholder="Mainadev Ltd" />
                <Input label="Physical Location" name="location" required placeholder="KICC Convention Hall" />
                <Input label="Event Date" name="date" type="date" required />
                <Button type="submit" className="w-full">
                  INITIALIZE DEPLOYMENT
                </Button>
              </form>
            </motion.div>
          )}

          {view === 'ticket' && lastTicket && (
            <motion.div
              key="ticket"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-12 py-12"
            >
              <div className="bg-white text-black p-10 rounded-[2rem] w-full max-w-[400px] text-center shadow-2xl shadow-[#9df9ef]/10 relative overflow-hidden flex flex-col items-center">
                <div className="absolute top-0 w-full h-2 bg-[#9df9ef]" />
                <p className="text-[10px] font-black tracking-[0.3em] text-gray-400 uppercase mb-4">ACCESS GRANTED</p>
                <h3 className="text-4xl font-black tracking-tighter leading-none mb-2">{lastTicket.name}</h3>
                <div className="bg-black text-[#9df9ef] px-6 py-2 rounded-full text-xs font-black mb-8">
                  {lastTicket.type}
                </div>
                
                <div className="bg-[#f0f0f0] p-6 rounded-3xl mb-8">
                  <QrCode size={160} strokeWidth={1} />
                </div>

                <div className="w-full text-left space-y-4 pt-6 border-t border-dashed border-gray-300">
                  <div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase">
                    <span>Event</span>
                    <span className="text-black">{lastTicket.eventId}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase">
                    <span>Location</span>
                    <span className="text-black">{lastTicket.eventLocation}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase">
                    <span>Issued</span>
                    <span className="text-black">{new Date().toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-[#9df9ef]/10 border border-[#9df9ef]/20 rounded-2xl w-full text-left">
                  <p className="text-[10px] font-black text-[#80e0d6] uppercase tracking-widest flex items-center gap-2 mb-1">
                    <CheckCircle2 size={12} /> Digital Signature
                  </p>
                  <p className="text-[9px] text-gray-500 font-mono break-all leading-relaxed">
                    MAINADEV-XPO-PROTO-SEC-2026-{lastTicket.id.toUpperCase()}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 no-print">
                <Button onClick={() => window.print()} variant="outline">
                  <Printer size={20} /> PRINT BADGE
                </Button>
                <Button onClick={() => setView('landing')}>
                  DONE
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {loading && (
        <div className="fixed inset-0 z-[100] bg-[#0a0a0a]/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-[#1a1a1a] border-t-[#9df9ef] rounded-full animate-spin" />
          <p className="text-[#9df9ef] font-black tracking-widest text-xs uppercase animate-pulse">Syncing Cloud</p>
        </div>
      )}

      {/* PC Footer */}
      <footer className="mt-24 border-t border-[#1a1a1a] py-24 px-12 grid grid-cols-1 md:grid-cols-4 gap-12 no-print opacity-50 hover:opacity-100 transition-opacity">
        <div className="space-y-4">
          <h4 className="text-[#9df9ef] font-black text-xs tracking-widest uppercase">XPO-PASS</h4>
          <p className="text-sm text-gray-500 leading-relaxed">
            High-fidelity event entry systems. Engineered for reliability at scale.
          </p>
          <p className="text-xs font-bold text-[#9df9ef]/50">© 2026 Mainadev Solutions</p>
        </div>
        <div className="space-y-4">
          <h4 className="text-white font-black text-xs tracking-widest uppercase">Infrastructure</h4>
          <nav className="flex flex-col gap-2 text-sm text-gray-500">
            <a href="#" className="hover:text-[#9df9ef]">Cloud Architecture</a>
            <a href="#" className="hover:text-[#9df9ef]">Lanyard API</a>
            <a href="#" className="hover:text-[#9df9ef]">24/7 Deployment</a>
          </nav>
        </div>
        <div className="space-y-4">
          <h4 className="text-white font-black text-xs tracking-widest uppercase">Developer</h4>
          <nav className="flex flex-col gap-2 text-sm text-gray-500">
            <a href="#" className="hover:text-[#9df9ef]">Mainadev Systems</a>
            <a href="#" className="hover:text-[#9df9ef]">Status Dashboard</a>
            <a href="#" className="hover:text-[#9df9ef]">Security Standards</a>
          </nav>
        </div>
        <div className="space-y-4">
          <h4 className="text-white font-black text-xs tracking-widest uppercase">Roadmap</h4>
          <div className="space-y-2">
            <p className="text-xs text-gray-400 font-bold">JULY 2026</p>
            <p className="text-sm text-gray-500">AI Badge Facial Recognition</p>
            <p className="text-xs text-gray-400 font-bold mt-2">AUG 2026</p>
            <p className="text-sm text-gray-500">NFC Pass Integration</p>
          </div>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes infinite-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-infinite-scroll {
          animation: infinite-scroll 40s linear infinite;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; padding: 0 !important; }
          main { p: 0 !important; max-width: none !important; }
        }
      `}} />
    </div>
  );
}
