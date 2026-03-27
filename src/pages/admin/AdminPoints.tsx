import { useEffect, useState } from 'react';
import { getClients, getRewards, getRedemptions, addPoints, saveRewards } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Trash2, Edit2, Check, X, Plus, Gift, Star, Zap, Users, ShoppingBag, RefreshCw } from 'lucide-react';
import type { Client, Reward } from '@/types';

// ======================================================
// REGLAS DE PUNTOS — editables desde la interfaz
// ======================================================

interface PointRule {
  id: string;
  label: string;
  descripcion: string;
  puntos: number;
  icon: string;
}

const DEFAULT_RULES: PointRule[] = [
  { id: 'renovacion', label: 'Renovación mensual', descripcion: 'Cliente renueva su plan de viandas', puntos: 30, icon: 'refresh' },
  { id: 'plan_completo', label: 'Plan completo del mes', descripcion: 'Completó todas las viandas del mes sin ausencias', puntos: 50, icon: 'star' },
  { id: 'producto_extra', label: 'Compra producto extra', descripcion: 'Pan, budín, postre u otra vianda suelta', puntos: 15, icon: 'bag' },
  { id: 'referido', label: 'Referido que compra', descripcion: 'Un cliente referido concreta un plan', puntos: 40, icon: 'users' },
];

const DEFAULT_REWARDS: Reward[] = [
  { id: 'r1', nombre: '🥗 1 Vianda extra', descripcion: 'Una vianda gratis para usar cuando quieras', puntosRequeridos: 100, activo: true },
  { id: 'r2', nombre: '🎁 Postre o budín gratis', descripcion: 'Un postre o budín de tu elección', puntosRequeridos: 200, activo: true },
  { id: 'r3', nombre: '💸 15% off productos extras', descripcion: 'Descuento en tu próxima compra de productos', puntosRequeridos: 350, activo: true },
  { id: 'r4', nombre: '🌟 5 Viandas gratis', descripcion: 'Cinco viandas para usar en el mes', puntosRequeridos: 500, activo: true },
];

function getRules(): PointRule[] {
  try {
    const saved = localStorage.getItem('mp_point_rules');
    return saved ? JSON.parse(saved) : DEFAULT_RULES;
  } catch { return DEFAULT_RULES; }
}

function saveRules(rules: PointRule[]) {
  localStorage.setItem('mp_point_rules', JSON.stringify(rules));
}

const ICON_MAP: Record<string, React.ReactNode> = {
  refresh: <RefreshCw className="w-4 h-4" />,
  star: <Star className="w-4 h-4" />,
  bag: <ShoppingBag className="w-4 h-4" />,
  users: <Users className="w-4 h-4" />,
  zap: <Zap className="w-4 h-4" />,
  gift: <Gift className="w-4 h-4" />,
};

interface RewardForm {
  id: string | null;
  nombre: string;
  descripcion: string;
  puntosRequeridos: number;
}

const EMPTY_REWARD_FORM: RewardForm = { id: null, nombre: '', descripcion: '', puntosRequeridos: 100 };

type Tab = 'asignar' | 'reglas' | 'premios' | 'canjes';

export default function AdminPoints() {
  const [activeTab, setActiveTab] = useState<Tab>('asignar');
  const [clients, setClients] = useState<Client[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [rules, setRules] = useState<PointRule[]>(getRules());
  const [redemptions, setRedemptions] = useState(getRedemptions());
  const [loading, setLoading] = useState(true);

  const [selectedClient, setSelectedClient] = useState('');
  const [selectedRule, setSelectedRule] = useState('');
  const [puntosCustom, setPuntosCustom] = useState(0);
  const [motivoCustom, setMotivoCustom] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const [rewardForm, setRewardForm] = useState<RewardForm>(EMPTY_REWARD_FORM);
  const [editingReward, setEditingReward] = useState(false);

  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [ruleEditValue, setRuleEditValue] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setClients(await getClients());
        const saved = getRewards();
        if (saved.length === 0) { saveRewards(DEFAULT_REWARDS); setRewards(DEFAULT_REWARDS); }
        else setRewards(saved);
        setRedemptions(getRedemptions());
      } finally { setLoading(false); }
    })();
  }, []);

  const getPuntosToAssign = () => useCustom ? puntosCustom : (rules.find(r => r.id === selectedRule)?.puntos || 0);
  const getMotivoToAssign = () => useCustom ? motivoCustom : (rules.find(r => r.id === selectedRule)?.label || '');

  const handleAddPoints = async () => {
    const puntos = getPuntosToAssign();
    const motivo = getMotivoToAssign();
    if (!selectedClient) { toast.error('Seleccioná un cliente'); return; }
    if (!puntos) { toast.error('Los puntos deben ser distintos de 0'); return; }
    if (!motivo) { toast.error('Ingresá un motivo'); return; }
    await addPoints(selectedClient, puntos, motivo);
    setClients(await getClients());
    setSelectedClient(''); setSelectedRule(''); setPuntosCustom(0); setMotivoCustom('');
    toast.success(`${puntos > 0 ? '+' : ''}${puntos} puntos asignados`);
  };

  const handleSaveReward = () => {
    if (!rewardForm.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (rewardForm.puntosRequeridos <= 0) { toast.error('Los puntos deben ser mayores a 0'); return; }
    let updated: Reward[];
    if (rewardForm.id) {
      updated = rewards.map(r => r.id === rewardForm.id ? { ...r, nombre: rewardForm.nombre.trim(), descripcion: rewardForm.descripcion.trim(), puntosRequeridos: rewardForm.puntosRequeridos } : r);
      toast.success('Premio actualizado');
    } else {
      updated = [...rewards, { id: Date.now().toString(), nombre: rewardForm.nombre.trim(), descripcion: rewardForm.descripcion.trim(), puntosRequeridos: rewardForm.puntosRequeridos, activo: true }];
      toast.success('Premio creado');
    }
    saveRewards(updated); setRewards(updated); setRewardForm(EMPTY_REWARD_FORM); setEditingReward(false);
  };

  const handleDeleteReward = (id: string) => {
    if (!window.confirm('¿Eliminar este premio?')) return;
    const updated = rewards.filter(r => r.id !== id);
    saveRewards(updated); setRewards(updated); toast.success('Premio eliminado');
  };

  const handleSaveRule = (id: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, puntos: ruleEditValue } : r);
    saveRules(updated); setRules(updated); setEditingRule(null); toast.success('Regla actualizada');
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'asignar', label: 'Asignar puntos', icon: <Zap className="w-4 h-4" /> },
    { id: 'reglas', label: 'Reglas', icon: <Star className="w-4 h-4" /> },
    { id: 'premios', label: 'Premios', icon: <Gift className="w-4 h-4" /> },
    { id: 'canjes', label: 'Canjes', icon: <Check className="w-4 h-4" /> },
  ];

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;

  const selectedClient_ = clients.find(c => c.id === selectedClient);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Puntos y premios</h1>
        <p className="page-subtitle">Sistema de fidelización de clientes</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap border-b border-border pb-3">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Asignar puntos */}
      {activeTab === 'asignar' && (
        <div className="glass-card p-5 space-y-5">
          <div>
            <Label>Cliente</Label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm mt-1" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
              <option value="">Seleccionar cliente...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido} — {c.puntos} pts</option>)}
            </select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Label>Tipo de asignación</Label>
              <div className="flex gap-2">
                <button onClick={() => setUseCustom(false)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${!useCustom ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Por regla</button>
                <button onClick={() => setUseCustom(true)} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${useCustom ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Manual</button>
              </div>
            </div>

            {!useCustom ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {rules.map(rule => (
                  <button key={rule.id} onClick={() => setSelectedRule(rule.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${selectedRule === rule.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{rule.label}</span>
                      <Badge variant={selectedRule === rule.id ? 'default' : 'secondary'}>+{rule.puntos} pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{rule.descripcion}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Puntos (negativo para restar)</Label>
                  <Input type="number" value={puntosCustom} onChange={e => setPuntosCustom(Number(e.target.value))} className="mt-1" />
                </div>
                <div>
                  <Label>Motivo</Label>
                  <Input value={motivoCustom} onChange={e => setMotivoCustom(e.target.value)} placeholder="Ej: ajuste, bono especial..." className="mt-1" />
                </div>
              </div>
            )}
          </div>

          {selectedClient_ && (selectedRule || useCustom) && (
            <div className="bg-muted rounded-lg p-3 text-sm flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">
                <strong className="text-foreground">{getPuntosToAssign() > 0 ? '+' : ''}{getPuntosToAssign()} pts</strong> para <strong className="text-foreground">{selectedClient_?.nombre}</strong>
              </span>
              <span className="text-xs text-muted-foreground">{getMotivoToAssign()}</span>
            </div>
          )}

          <Button onClick={handleAddPoints} disabled={!selectedClient || (!selectedRule && !useCustom)}>
            <Zap className="w-4 h-4 mr-2" />Asignar puntos
          </Button>
        </div>
      )}

      {/* TAB: Reglas */}
      {activeTab === 'reglas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">Editá los puntos asignados por cada acción.</p>
            <Button variant="outline" size="sm" onClick={() => { if (window.confirm('¿Restaurar valores por defecto?')) { saveRules(DEFAULT_RULES); setRules(DEFAULT_RULES); toast.success('Restaurado'); } }}>
              <RefreshCw className="w-3 h-3 mr-2" />Restaurar defaults
            </Button>
          </div>
          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className="glass-card p-4 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {ICON_MAP[rule.icon] || <Star className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{rule.label}</p>
                  <p className="text-xs text-muted-foreground">{rule.descripcion}</p>
                </div>
                {editingRule === rule.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Input type="number" value={ruleEditValue} onChange={e => setRuleEditValue(Number(e.target.value))} className="w-20 h-8 text-sm" />
                    <Button size="sm" onClick={() => handleSaveRule(rule.id)}><Check className="w-3 h-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingRule(null)}><X className="w-3 h-3" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="font-bold">+{rule.puntos} pts</Badge>
                    <Button size="sm" variant="outline" onClick={() => { setEditingRule(rule.id); setRuleEditValue(rule.puntos); }}><Edit2 className="w-3 h-3" /></Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: Premios */}
      {activeTab === 'premios' && (
        <div className="space-y-4">
          <div className="space-y-3">
            {[...rewards].sort((a, b) => a.puntosRequeridos - b.puntosRequeridos).map(reward => (
              <div key={reward.id} className="glass-card p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl shrink-0">
                  {reward.nombre.split(' ')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{reward.nombre.split(' ').slice(1).join(' ')}</p>
                  <p className="text-xs text-muted-foreground">{reward.descripcion}</p>
                </div>
                <Badge className="shrink-0">{reward.puntosRequeridos} pts</Badge>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => { setRewardForm({ id: reward.id, nombre: reward.nombre, descripcion: reward.descripcion, puntosRequeridos: reward.puntosRequeridos }); setEditingReward(true); setActiveTab('premios'); }}>
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteReward(reward.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-card p-5 space-y-4 border-2 border-dashed border-border">
            <h3 className="font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" />{editingReward ? 'Editando premio' : 'Nuevo premio'}
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Nombre (podés incluir emoji al inicio)</Label>
                <Input value={rewardForm.nombre} onChange={e => setRewardForm({ ...rewardForm, nombre: e.target.value })} placeholder="🎁 Nombre del premio" className="mt-1" />
              </div>
              <div>
                <Label>Puntos requeridos</Label>
                <Input type="number" value={rewardForm.puntosRequeridos} onChange={e => setRewardForm({ ...rewardForm, puntosRequeridos: Number(e.target.value) })} className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <Label>Descripción</Label>
                <Input value={rewardForm.descripcion} onChange={e => setRewardForm({ ...rewardForm, descripcion: e.target.value })} placeholder="Descripción breve del premio" className="mt-1" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveReward}><Check className="w-4 h-4 mr-2" />{editingReward ? 'Guardar cambios' : 'Crear premio'}</Button>
              {editingReward && <Button variant="outline" onClick={() => { setRewardForm(EMPTY_REWARD_FORM); setEditingReward(false); }}><X className="w-4 h-4 mr-2" />Cancelar</Button>}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Canjes */}
      {activeTab === 'canjes' && (
        <div className="glass-card p-5">
          {redemptions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Todavía no hay canjes registrados.</p>
          ) : (
            <div className="space-y-3">
              {[...redemptions].reverse().map(r => {
                const reward = rewards.find(rw => rw.id === r.rewardId);
                const client = clients.find(c => c.id === r.clientId);
                return (
                  <div key={r.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0">
                    <div>
                      <p className="font-medium text-sm">{reward?.nombre || 'Premio'}</p>
                      <p className="text-xs text-muted-foreground">
                        {client ? `${client.nombre} ${client.apellido}` : 'Cliente'} · {new Date(r.fecha).toLocaleDateString('es-AR')}
                      </p>
                    </div>
                    <Badge variant="secondary">{r.puntosUsados} pts</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}