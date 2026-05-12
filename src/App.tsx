/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  setDoc,
  serverTimestamp, 
  query, 
  orderBy, 
  where,
  limit,
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

type Role = 'visitor' | 'company' | 'staff' | 'guest';
type View = 'landing' | 'events' | 'form' | 'company-dash' | 'staff-dash' | 'ticket' | 'create-event' | 'login-company' | 'login-staff' | 'staff-auth' | 'verify';

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [user, setUser] = useState<{ uid: string; email: string | null; role: Role } | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastTicket, setLastTicket] = useState<Attendee | null>(null);
  const [staffAuths, setStaffAuths] = useState<any[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [userEnteredCode, setUserEnteredCode] = useState('');
  const [staffSearch, setStaffSearch] = useState('');

  // Form State
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    role: '',
    industry: 'Technology',
    referral: '',
    intent: '',
    type: 'VISITOR' as RegistrationType,
  });

  // Derived Companies
  const companies = Array.from(new Set(events.filter(e => e.companyId && e.company).map(e => JSON.stringify({ id: e.companyId, name: e.company }))))
    .map((s: string) => JSON.parse(s)) as { id: string; name: string }[];

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(staffSearch.toLowerCase())
  );

  // Init Connection & Auth
  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      if (u && !u.isAnonymous) {
        setLoading(true);
        setUser({ 
          uid: u.uid, 
          email: u.email, 
          role: 'company' // Simplified for now, in real app check collections
        });
      } else {
        setUser({ uid: u?.uid || 'temp', email: null, role: 'guest' });
      }
      setLoading(false);
    });
  }, []);

  // Listeners
  useEffect(() => {
    const qEvents = query(collection(db, 'events'), orderBy('createdAt', 'desc'));
    const unsubEvents = onSnapshot(qEvents, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Event)));
    }, (err) => console.error(err));

    return () => unsubEvents();
  }, []);

  useEffect(() => {
    if (user?.role === 'company' || (user?.role === 'staff' && activeCompanyId)) {
      const targetId = user.role === 'company' ? user.uid : activeCompanyId;
      const qAttendees = query(
        collection(db, 'attendees'), 
        where('companyId', '==', targetId),
        orderBy('createdAt', 'desc')
      );
      const unsubAttendees = onSnapshot(qAttendees, (snap) => {
        setAttendees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendee)));
      }, (err) => console.error(err));
      
      return () => unsubAttendees();
    }
  }, [user, activeCompanyId]);

  useEffect(() => {
    if (user?.role === 'company' || user?.role === 'staff') {
      const qAuths = user.role === 'company' 
        ? query(collection(db, 'staff_authorizations'), where('companyId', '==', user.uid))
        : query(collection(db, 'staff_authorizations'), where('staffEmail', '==', user.email));

      const unsubAuths = onSnapshot(qAuths, (snap) => {
        setStaffAuths(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      return () => unsubAuths();
    }
  }, [user]);

  // Actions
  const handleSignIn = async (role: Role) => {
    const provider = new GoogleAuthProvider();
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, provider);
      setUser({ uid: result.user.uid, email: result.user.email, role });
      setView(role === 'company' ? 'company-dash' : 'staff-dash');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleStaffOTPRequest = (email: string, companyId: string) => {
    if (!email || !companyId) return;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setVerificationCode(code);
    setActiveCompanyId(companyId);
    setFormData({ ...formData, email }); // Reuse email field for verification screen
    setView('verify');
    console.log(`[STAFF OTP] Simulation: ${code}`);
  };

  const visitorLogin = (email: string) => {
    if (!email) return;
    setUser({ uid: 'visitor-temp', email, role: 'visitor' });
    setView('events');
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUser({ uid: 'temp', email: null, role: 'guest' });
    setView('landing');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    
    // Generate verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setVerificationCode(code);
    setView('verify');
    
    // In a real app, this is where you'd call an API to send the email
    console.log(`[SIMULATION] Email sent to ${formData.email} with code: ${code}`);
  };

  const verifyAndFinalize = async () => {
    if (userEnteredCode !== verificationCode) {
      alert('Invalid code.');
      return;
    }

    if (!selectedEvent && (user?.role === 'guest' || !user)) {
      // Staff login scenario via OTP
      setUser({ uid: 'staff-session', email: formData.email, role: 'staff' });
      setView('staff-dash');
      setVerificationCode('');
      setUserEnteredCode('');
      return;
    }

    setLoading(true);
    try {
      const data = {
        ...formData,
        eventId: selectedEvent?.name,
        eventLocation: selectedEvent?.location,
        companyId: selectedEvent?.companyId,
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'attendees'), data);
      setLastTicket({ id: docRef.id, ...data } as Attendee);
      setView('ticket');
      setStep(1);
      setVerificationCode('');
      setUserEnteredCode('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'attendees');
    } finally {
      setLoading(false);
    }
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role !== 'company') return;
    const target = e.target as any;
    const newEvent = {
      name: target.name.value,
      company: target.company.value,
      date: target.date.value,
      location: target.location.value,
      companyId: user.uid,
      createdAt: serverTimestamp(),
    };
    try {
      setLoading(true);
      await addDoc(collection(db, 'events'), newEvent);
      setView('company-dash');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'events');
    } finally {
      setLoading(false);
    }
  };

  const authorizeStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role !== 'company') return;
    const target = e.target as any;
    const staffEmail = target.email.value;
    try {
      setLoading(true);
      await setDoc(doc(db, 'staff_authorizations', `${staffEmail}_${user.uid}`), {
        companyId: user.uid,
        staffEmail,
        authorized: true
      });
      alert('Staff authorized');
      target.reset();
    } catch (err) {
      console.error(err);
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
      <nav className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-[#1a1a1a] px-6 py-4 flex justify-between items-center no-print">
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
              <p className="text-gray-500 text-sm uppercase tracking-widest">{user?.role || 'GUEST'}</p>
            </div>
            
            <button className="text-left text-2xl font-bold hover:text-[#9df9ef]" onClick={() => { setView('landing'); setMenuOpen(false); }}>Home</button>
            <button className="text-left text-2xl font-bold hover:text-[#9df9ef]" onClick={() => { setView('events'); setMenuOpen(false); }}>Events</button>

            {user?.role === 'company' && (
              <button className="text-left text-2xl font-bold hover:text-[#9df9ef]" onClick={() => { setView('company-dash'); setMenuOpen(false); }}>Dashboard</button>
            )}
            {user?.role === 'staff' && (
              <button className="text-left text-2xl font-bold hover:text-[#9df9ef]" onClick={() => { setView('staff-dash'); setMenuOpen(false); }}>Registers</button>
            )}

            {user?.email ? (
              <button className="text-left text-2xl font-bold text-red-500" onClick={handleSignOut}>Logout</button>
            ) : (
              <div className="flex flex-col gap-4 mt-8">
                <button className="text-left font-bold text-[#9df9ef]" onClick={() => { setView('events'); setMenuOpen(false); }}>Register as Visitor</button>
                <button className="text-left font-bold text-[#9df9ef]" onClick={() => { setView('login-company'); setMenuOpen(false); }}>Event-Company Portal</button>
                <button className="text-left font-bold text-[#9df9ef]" onClick={() => { setView('login-staff'); setMenuOpen(false); }}>Event-Staff Portal</button>
              </div>
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
              className="min-h-[80vh] flex flex-col justify-center items-center text-center gap-12"
            >
              <div className="space-y-4">
                <h1 className="text-7xl md:text-9xl font-black tracking-tighter leading-none">
                  XPO<br /><span className="text-[#9df9ef]">PASS</span>
                </h1>
                <p className="text-gray-500 font-medium tracking-widest uppercase text-sm">
                  Professional Event Access Ecosystem
                </p>
              </div>

              <div className="flex flex-col gap-4 w-full max-w-sm">
                <Button onClick={() => setView('events')} className="w-full text-lg h-16 group">
                  PICK EVENT <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />
                </Button>
                <div className="flex gap-4">
                  <Button variant="outline" onClick={() => setView('login-company')} className="flex-1 text-[10px] sm:text-xs">
                    EVENT COMPANY LOGIN
                  </Button>
                  <Button variant="outline" onClick={() => setView('login-staff')} className="flex-1 text-[10px] sm:text-xs">
                    EVENT STAFF LOGIN
                  </Button>
                </div>
              </div>

              {/* Sponsors Section */}
              <div className="w-full max-w-5xl mt-12 space-y-8">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-black tracking-[0.4em] text-[#9df9ef] uppercase mb-4 opacity-80">Sponsors</span>
                  <div className="flex flex-wrap justify-center gap-12 opacity-100 transition-all duration-700">
                    {['Google', 'Intel', 'Nvidia', 'Samsung'].map(name => (
                      <div key={name} className="flex items-center gap-3 font-black text-2xl tracking-tighter hover:text-[#9df9ef] transition-colors">
                        <div className="w-2 h-2 bg-[#9df9ef] rounded-full" />
                        {name}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Used By Marquee */}
                <div className="relative pt-12">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#1a1a1a]"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[#0a0a0a] px-6 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Event Companies Using XPOPASS</span>
                  </div>
                </div>

                <div className="w-full overflow-hidden py-16 bg-[#0d0d0d] rounded-[3rem] border border-[#1a1a1a] mt-8">
                  <div className="flex gap-24 whitespace-nowrap animate-infinite-scroll w-max items-center">
                    {[
                      'APPLE', 'MICROSOFT', 'AMAZON', 'TESLA', 'ADOBE', 'SALESFORCE', 'SLACK', 'SPOTIFY'
                    ].map((name, idx) => (
                      <div key={idx} className="flex items-center justify-center min-w-[120px]">
                        <span className="text-3xl md:text-5xl font-black text-[#1a1a1a] hover:text-[#9df9ef] transition-colors cursor-default tracking-tighter">
                          {name}
                        </span>
                      </div>
                    ))}
                    {/* Duplicate for seamless loop */}
                    {[
                      'APPLE', 'MICROSOFT', 'AMAZON', 'TESLA', 'ADOBE', 'SALESFORCE', 'SLACK', 'SPOTIFY'
                    ].map((name, idx) => (
                      <div key={`dup-${idx}`} className="flex items-center justify-center min-w-[120px]">
                        <span className="text-3xl md:text-5xl font-black text-[#1a1a1a] hover:text-[#9df9ef] transition-colors cursor-default tracking-tighter">
                          {name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'login-visitor' && (
            <motion.div key="v-login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto py-24 text-center">
              <h2 className="text-4xl font-black mb-8">Visitor Access</h2>
              <p className="text-gray-500 mb-8">Enter your email to access your digital event pass.</p>
              <form onSubmit={(e) => { e.preventDefault(); visitorLogin((e.target as any).email.value); }}>
                <Input label="Email Address" name="email" type="email" required placeholder="visitor@mainadev.com" />
                <Button type="submit" className="w-full">CONTINUE</Button>
                <Button variant="ghost" onClick={() => setView('landing')} className="mt-4">BACK</Button>
              </form>
            </motion.div>
          )}

          {view === 'login-company' && (
            <motion.div key="c-login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto py-24 text-center">
              <Building2 size={64} className="mx-auto text-[#9df9ef] mb-8" />
              <h2 className="text-4xl font-black mb-4">Company Portal</h2>
              <p className="text-gray-500 mb-12">Manage your events and digital attendee infrastructure.</p>
              <div className="flex flex-col gap-4">
                <Button onClick={() => handleSignIn('company')} className="w-full">SIGN IN</Button>
                <Button variant="outline" onClick={() => handleSignIn('company')} className="w-full">CREATE ACCOUNT</Button>
              </div>
              <Button variant="ghost" onClick={() => setView('landing')} className="mt-8">BACK</Button>
            </motion.div>
          )}

          {view === 'login-staff' && (
            <motion.div key="s-login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto py-12">
              <div className="text-center mb-12">
                <ShieldCheck size={48} className="mx-auto text-[#9df9ef] mb-4" />
                <h2 className="text-4xl font-black mb-2">Staff Portal</h2>
                <p className="text-gray-500">Access registers via authorized code.</p>
              </div>

              <div className="space-y-6">
                <div>
                  <Input 
                    label="Search Company" 
                    value={staffSearch} 
                    onChange={e => setStaffSearch(e.target.value)} 
                    placeholder="Type to search..." 
                  />
                  <div className="max-h-48 overflow-y-auto bg-[#141414] border border-[#1a1a1a] rounded-xl divide-y divide-[#1a1a1a] mt-2">
                    {filteredCompanies.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setActiveCompanyId(c.id)}
                        className={cn(
                          "w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors flex justify-between items-center",
                          activeCompanyId === c.id ? "text-[#9df9ef] bg-[#9df9ef]/5" : "text-gray-400"
                        )}
                      >
                        {c.name}
                        {activeCompanyId === c.id && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                    {filteredCompanies.length === 0 && (
                      <div className="p-4 text-center text-xs text-gray-600 italic">No companies found</div>
                    )}
                  </div>
                </div>

                <form onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  if (!activeCompanyId) { alert('Please select a company first'); return; }
                  handleStaffOTPRequest(target.email.value, activeCompanyId);
                }}>
                  <Input label="Your Staff Email" name="email" type="email" required placeholder="staff@company.com" />
                  <Button type="submit" className="w-full">REQUEST ACCESS CODE</Button>
                </form>
              </div>
              <Button variant="ghost" onClick={() => setView('landing')} className="w-full mt-4">BACK</Button>
            </motion.div>
          )}

          {view === 'events' && (
            <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <h2 className="text-4xl font-black">Active Events</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event) => (
                  <motion.div
                    key={event.id}
                    whileHover={{ scale: 1.02 }}
                    className="p-8 bg-[#141414] border border-[#1a1a1a] rounded-3xl cursor-pointer"
                    onClick={() => { setSelectedEvent(event); setView('form'); }}
                  >
                    <h3 className="text-2xl font-black mb-4 text-[#9df9ef]">{event.name}</h3>
                    <div className="space-y-2 text-sm text-gray-400">
                      <p><Building2 size={14} className="inline mr-2" /> {event.company}</p>
                      <p><Calendar size={14} className="inline mr-2" /> {event.date}</p>
                      <p><MapPin size={14} className="inline mr-2" /> {event.location}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'form' && (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto py-12">
              <div className="text-center mb-12">
                <p className="text-[#9df9ef] font-black text-xl">Register for {selectedEvent?.name}</p>
                <div className="flex gap-1 justify-center mt-4">
                  {[1, 2, 3, 4, 5].map(s => (
                    <div key={s} className={cn("h-1 w-8 rounded-full transition-colors", step >= s ? "bg-[#9df9ef]" : "bg-[#1a1a1a]")} />
                  ))}
                </div>
              </div>
              <form onSubmit={handleRegister} className="space-y-6">
                {step === 1 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Input label="Full Name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="John Doe" />
                    <Input label="Email Address" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required placeholder="john@example.com" />
                  </motion.div>
                )}
                {step === 2 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Input label="Phone Number" type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} required placeholder="+254 ..." />
                    <Input label="Organization / Company" value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} required placeholder="Mainadev Ltd" />
                  </motion.div>
                )}
                {step === 3 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Input label="Job Title / Role" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} required placeholder="Software Engineer" />
                    <Select 
                      label="Industry" 
                      value={formData.industry} 
                      onChange={e => setFormData({ ...formData, industry: e.target.value })}
                      options={[
                        { value: 'Technology', label: 'Technology' },
                        { value: 'Finance', label: 'Finance' },
                        { value: 'Creative', label: 'Creative' },
                        { value: 'Health', label: 'Health' },
                        { value: 'Energy', label: 'Energy' },
                        { value: 'Other', label: 'Other' },
                      ]} 
                    />
                  </motion.div>
                )}
                {step === 4 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Input label="Where did you hear about us?" value={formData.referral} onChange={e => setFormData({ ...formData, referral: e.target.value })} required placeholder="Twitter, Linkedin, Friend..." />
                    <Input label="Primary Goal for attending" value={formData.intent} onChange={e => setFormData({ ...formData, intent: e.target.value })} required placeholder="Networking, Learning, Partnership..." />
                  </motion.div>
                )}
                {step === 5 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <Select 
                      label="Registration Type" 
                      value={formData.type} 
                      onChange={e => setFormData({ ...formData, type: e.target.value as RegistrationType })}
                      options={[
                        { value: 'VISITOR', label: 'Visitor' },
                        { value: 'EXHIBITOR', label: 'Exhibitor' },
                      ]} 
                    />
                    <div className="p-4 bg-[#141414] border border-[#1a1a1a] rounded-2xl text-xs text-gray-500">
                      <p>By clicking "GET PASS", you agree to receive a verification code on your provided email address to finalize your registration.</p>
                    </div>
                  </motion.div>
                )}
                <div className="flex gap-4">
                  {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>BACK</Button>}
                  {step < 5 ? (
                    <Button className="flex-1" onClick={() => setStep(step + 1)}>CONTINUE</Button>
                  ) : (
                    <Button type="submit" className="flex-1">GET PASS</Button>
                  )}
                </div>
              </form>
            </motion.div>
          )}

          {view === 'verify' && (
            <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto py-24 text-center">
              <h2 className="text-4xl font-black mb-4">Email Verification</h2>
              <p className="text-gray-500 mb-12">
                We've sent a 6-digit access code to <span className="text-[#9df9ef]">{formData.email}</span>. Please enter it below to download your pass.
              </p>
              <Input 
                label="Verification Code" 
                value={userEnteredCode} 
                onChange={e => setUserEnteredCode(e.target.value)} 
                placeholder="000000"
                maxLength={6}
                className="text-center text-3xl tracking-[1em]"
              />
              <Button onClick={verifyAndFinalize} className="w-full">VERIFY & GENERATE PASS</Button>
              <Button variant="ghost" onClick={() => setView('form')} className="mt-4">BACK TO FORM</Button>
              
              <div className="mt-12 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs text-yellow-500/80">
                <p>DEMO MODE: The simulated code is <span className="font-black text-white">{verificationCode}</span></p>
              </div>
            </motion.div>
          )}

          {view === 'company-dash' && (
            <motion.div key="company-dash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-4xl font-black">Company <span className="text-[#9df9ef]">Dashboard</span></h2>
                <div className="flex gap-4">
                  <Button 
                    variant="ghost" 
                    className="text-xs text-[#9df9ef]/40"
                    onClick={async () => {
                      if(!confirm('Deploy sample data for your company?')) return;
                      try {
                        setLoading(true);
                        const sampleEvent = await addDoc(collection(db, 'events'), {
                          name: 'Demo Tech Summit 2026',
                          company: 'Mainadev Labs',
                          date: '2026-10-12',
                          location: 'Virtual Plaza',
                          companyId: user?.uid,
                          createdAt: serverTimestamp()
                        });
                        alert('Sample event created');
                      } catch (err) { alert('Error seeding: ' + err); }
                      finally { setLoading(false); }
                    }}
                  >
                    SEED DEMO DATA
                  </Button>
                  <Button variant="ghost" onClick={() => setView('staff-auth')}><Users size={20} /> MANAGE STAFF</Button>
                  <Button onClick={() => setView('create-event')}><Plus size={20} /> DEPLOY EVENT</Button>
                </div>
              </div>

              <div className="bg-[#141414] border border-[#1a1a1a] rounded-3xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-[#1a1a1a] text-xs font-bold text-gray-500 uppercase">
                    <tr>
                      <th className="px-8 py-4">Attendee</th>
                      <th className="px-8 py-4">Event</th>
                      <th className="px-8 py-4">Type</th>
                      <th className="px-8 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a1a1a]">
                    {attendees.filter(a => a.companyId === user?.uid).map(a => (
                      <tr key={a.id} className="hover:bg-white/5">
                        <td className="px-8 py-6">
                          <p className="font-bold">{a.name}</p>
                          <p className="text-xs text-gray-500">{a.email}</p>
                        </td>
                        <td className="px-8 py-6 text-sm">{a.eventId}</td>
                        <td className="px-8 py-6 uppercase text-[10px] font-black">{a.type}</td>
                        <td className="px-8 py-6">
                          <button onClick={() => deleteAttendee(a.id)} className="text-red-500"><Trash2 size={18} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {view === 'staff-dash' && (
            <motion.div key="staff-dash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <h2 className="text-4xl font-black">Staff Access: <span className="text-[#9df9ef]">Registers</span></h2>
              {!activeCompanyId ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {staffAuths.length === 0 ? (
                    <div className="p-12 text-center border-2 border-dashed border-[#1a1a1a] rounded-3xl col-span-full">
                      <p className="text-gray-500">No authorized companies found for {user?.email}</p>
                    </div>
                  ) : (
                    staffAuths.map(auth => (
                      <div 
                        key={auth.id} 
                        className="p-8 bg-[#141414] border border-[#1a1a1a] rounded-3xl hover:border-[#9df9ef] cursor-pointer transition-colors"
                        onClick={() => setActiveCompanyId(auth.companyId)}
                      >
                        <Building2 className="text-[#9df9ef] mb-4" />
                        <h4 className="text-xl font-bold">Company ID: {auth.companyId}</h4>
                        <p className="text-sm text-gray-500 mt-2">Click to view registers</p>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="bg-[#141414] border border-[#1a1a1a] rounded-3xl p-8">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h4 className="font-bold flex items-center gap-2">
                        <Building2 size={16} /> Viewing: {activeCompanyId}
                      </h4>
                      <p className="text-xs text-gray-500">Authorized Access Only</p>
                    </div>
                    <Button variant="outline" onClick={() => setActiveCompanyId(null)}>SWITCH COMPANY</Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="text-xs text-gray-500 uppercase border-b border-[#1a1a1a]">
                        <tr>
                          <th className="py-4">Visitor Name</th>
                          <th className="py-4">Event</th>
                          <th className="py-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1a1a1a]">
                        {attendees.map(a => (
                          <tr key={a.id}>
                            <td className="py-4 font-bold">{a.name}</td>
                            <td className="py-4">{a.eventId}</td>
                            <td className="py-4 text-[#9df9ef] font-black">REGISTERED</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'staff-auth' && (
            <motion.div key="staff-auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-12">
              <h2 className="text-4xl font-black">Staff <span className="text-[#9df9ef]">Authorizations</span></h2>
              <form onSubmit={authorizeStaff} className="bg-[#141414] p-8 rounded-3xl border border-[#1a1a1a]">
                <Input label="Staff Email" name="email" type="email" required placeholder="staff@example.com" />
                <Button type="submit" className="w-full">GRANT ACCESS</Button>
              </form>
              <div className="space-y-4">
                <h4 className="text-gray-500 font-bold uppercase text-xs">Authorized Staff Members</h4>
                {staffAuths.filter(s => s.companyId === user?.uid).map(s => (
                  <div key={s.id} className="p-4 bg-[#1a1a1a] rounded-xl flex justify-between items-center">
                    <span className="font-bold">{s.staffEmail}</span>
                    <span className="text-[10px] font-black text-[#9df9ef]">ACTIVE</span>
                  </div>
                ))}
              </div>
              <Button variant="ghost" onClick={() => setView('company-dash')}>BACK TO DASHBOARD</Button>
            </motion.div>
          )}

          {view === 'create-event' && (
            <motion.div key="create-event" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto">
              <h2 className="text-4xl font-black mb-8">Deploy Event</h2>
              <form onSubmit={createEvent} className="bg-[#141414] p-8 rounded-3xl border border-[#1a1a1a] space-y-6">
                <Input label="Event Name" name="name" required />
                <Input label="Hosting Brand" name="company" required />
                <Input label="Location" name="location" required />
                <Input label="Date" name="date" type="date" required />
                <Button type="submit" className="w-full">START DEPLOYMENT</Button>
                <Button variant="ghost" onClick={() => setView('company-dash')} className="w-full">CANCEL</Button>
              </form>
            </motion.div>
          )}

          {view === 'ticket' && lastTicket && (
            <motion.div key="ticket" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-12">
               <div className="bg-white text-black p-10 rounded-[2rem] w-full max-w-[400px] text-center shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 w-full h-2 bg-[#9df9ef]" />
                <h3 className="text-4xl font-black tracking-tighter leading-none mb-4">{lastTicket.name}</h3>
                <div className="bg-black text-[#9df9ef] px-6 py-2 rounded-full text-xs font-black inline-block mb-8">{lastTicket.type}</div>
                <div className="bg-[#f0f0f0] p-6 rounded-3xl mb-8 flex justify-center"><QrCode size={160} /></div>
                <div className="text-left py-4 border-t border-dashed border-gray-300 space-y-2 text-xs uppercase font-bold text-gray-500">
                  <div className="flex justify-between"><span>Event</span><span className="text-black">{lastTicket.eventId}</span></div>
                  <div className="flex justify-between"><span>Issued</span><span className="text-black">{new Date().toLocaleDateString()}</span></div>
                </div>
              </div>
              <Button onClick={() => window.print()} variant="outline"><Printer size={20} /> PRINT BADGE</Button>
              <Button onClick={() => setView('landing')}>DONE</Button>
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
