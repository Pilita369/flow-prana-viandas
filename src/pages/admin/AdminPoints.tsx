import { useEffect, useState } from 'react';
import {
  getClients,
  getRewards,
  getRedemptions,
  addPoints,
  saveRewards,
} from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Trash2, Edit2, Check, X } from 'lucide-react';
import type { Client, Reward } from '@/types';

interface RewardForm {
  id: string | null;
  nombre: string;
  descripcion: string;
  puntosRequeridos: number;
}

const EMPTY_FORM: RewardForm = {
  id: null,
  nombre: '',
  descripcion: '',
  puntosRequeridos: 10,
};

export default function AdminPoints() {
  const [clients, setClients] = useState<Client[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState(getRedemptions());

  const [selectedClient, setSelectedClient] = useState('');
  const [puntosInput, setPuntosInput] = useState(0);
  const [motivoInput, setMotivoInput] = useState('');

  const [rewardForm, setRewardForm] = useState<RewardForm>(EMPTY_FORM);
  const [editingReward, setEditingReward] = useState(false);

  useEffect(() => {
    setClients(getClients());
    setRewards(getRewards());
    setRedemptions(getRedemptions());
  }, []);

  const handleAddPoints = () => {
    if (!selectedClient || !puntosInput || !motivoInput) {
      toast.error('Completá todos los campos');
      return;
    }

    addPoints(selectedClient, puntosInput, motivoInput);
    setClients(getClients());
    setPuntosInput(0);
    setMotivoInput('');
    toast.success('Puntos agregados');
  };

  const handleSaveReward = () => {
    if (!rewardForm.nombre.trim()) {
      toast.error('El nombre del premio no puede estar vacío');
      return;
    }

    if (rewardForm.puntosRequeridos <= 0) {
      toast.error('Los puntos requeridos deben ser mayores a 0');
      return;
    }

    let updatedRewards: Reward[];

    if (rewardForm.id) {
      updatedRewards = rewards.map((r) =>
        r.id === rewardForm.id
          ? {
              ...r,
              nombre: rewardForm.nombre.trim(),
              descripcion: rewardForm.descripcion.trim(),
              puntosRequeridos: rewardForm.puntosRequeridos,
              activo: true,
            }
          : r
      );
      toast.success('Premio actualizado');
    } else {
      const newReward: Reward = {
        id: Date.now().toString(),
        nombre: rewardForm.nombre.trim(),
        descripcion: rewardForm.descripcion.trim(),
        puntosRequeridos: rewardForm.puntosRequeridos,
        activo: true,
      };

      updatedRewards = [...rewards, newReward];
      toast.success('Premio creado');
    }

    saveRewards(updatedRewards);
    setRewards(updatedRewards);
    setRewardForm(EMPTY_FORM);
    setEditingReward(false);
  };

  const handleDeleteReward = (id: string) => {
    const ok = window.confirm('¿Eliminar este premio?');
    if (!ok) return;

    const updated = rewards.filter((r) => r.id !== id);
    saveRewards(updated);
    setRewards(updated);
    toast.success('Premio eliminado');
  };

  const handleEditReward = (reward: Reward) => {
    setRewardForm({
      id: reward.id,
      nombre: reward.nombre,
      descripcion: reward.descripcion,
      puntosRequeridos: reward.puntosRequeridos,
    });
    setEditingReward(true);
  };

  const handleCancelEdit = () => {
    setRewardForm(EMPTY_FORM);
    setEditingReward(false);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Puntos y premios</h1>
        <p className="page-subtitle">Gestioná puntos manuales, premios y canjes</p>
      </div>

      <div className="glass-card p-5 space-y-4">
        <h2 className="font-semibold">Agregar puntos manualmente</h2>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>Cliente</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
            >
              <option value="">Seleccionar cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.apellido}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Puntos</Label>
            <Input
              type="number"
              value={puntosInput}
              onChange={(e) => setPuntosInput(Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Motivo</Label>
            <Input
              value={motivoInput}
              onChange={(e) => setMotivoInput(e.target.value)}
              placeholder="Ej: ajuste manual"
            />
          </div>
        </div>

        <Button onClick={handleAddPoints}>Guardar puntos</Button>
      </div>

      <div className="glass-card p-5 space-y-4">
        <h2 className="font-semibold">{editingReward ? 'Editar premio' : 'Crear premio'}</h2>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>Nombre</Label>
            <Input
              value={rewardForm.nombre}
              onChange={(e) => setRewardForm({ ...rewardForm, nombre: e.target.value })}
            />
          </div>

          <div>
            <Label>Descripción</Label>
            <Input
              value={rewardForm.descripcion}
              onChange={(e) => setRewardForm({ ...rewardForm, descripcion: e.target.value })}
            />
          </div>

          <div>
            <Label>Puntos requeridos</Label>
            <Input
              type="number"
              value={rewardForm.puntosRequeridos}
              onChange={(e) =>
                setRewardForm({ ...rewardForm, puntosRequeridos: Number(e.target.value) })
              }
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSaveReward}>
            <Check className="w-4 h-4 mr-2" />
            Guardar premio
          </Button>

          {editingReward && (
            <Button variant="outline" onClick={handleCancelEdit}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="glass-card p-5 space-y-3">
        <h2 className="font-semibold">Premios</h2>

        {rewards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay premios cargados.</p>
        ) : (
          rewards.map((reward) => (
            <div
              key={reward.id}
              className="flex items-center justify-between border-b border-border pb-3"
            >
              <div>
                <p className="font-medium">{reward.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  {reward.descripcion} · {reward.puntosRequeridos} puntos
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleEditReward(reward)}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Editar
                </Button>

                <Button variant="destructive" size="sm" onClick={() => handleDeleteReward(reward.id)}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="glass-card p-5 space-y-3">
        <h2 className="font-semibold">Canjes</h2>

        {redemptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay canjes registrados.</p>
        ) : (
          redemptions.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <p className="font-medium">Canje #{r.id}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(r.fecha).toLocaleDateString('es-AR')} · {r.puntosUsados} pts
                </p>
              </div>

              <Badge>{r.puntosUsados} pts</Badge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}