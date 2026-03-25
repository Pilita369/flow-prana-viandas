// src/pages/admin/AdminPoints.tsx
// ======================================================
// GESTIÓN DE PUNTOS Y PREMIOS
// Desde acá podés:
//   - Agregar puntos manualmente a un cliente
//   - Crear, editar y eliminar premios (nombre, descripción, puntos)
//   - Ver y gestionar canjes pendientes
// ======================================================

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
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import type { Client, Reward } from '@/types';

// ── Tipo local para el formulario de premios ──
interface RewardForm {
  id:               string | null; // null = nuevo premio
  nombre:           string;
  descripcion:      string;
  puntosRequeridos: number;
}

const EMPTY_FORM: RewardForm = {
  id:               null,
  nombre:           '',
  descripcion:      '',
  puntosRequeridos: 10,
};

export default function AdminPoints() {
  const [clients,     setClients]     = useState<Client[]>([]);
  const [rewards,     setRewards]     = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<ReturnType<typeof getRedemptions>>([]);

  // ── Formulario para agregar puntos manualmente ──
  const [selectedClient, setSelectedClient] = useState('');
  const [puntosInput,    setPuntosInput]    = useState(0);
  const [motivoInput,    setMotivoInput]    = useState('');

  // ── Formulario de premios (crear / editar) ──
  const [rewardForm,    setRewardForm]    = useState<RewardForm>(EMPTY_FORM);
  const [editingReward, setEditingReward] = useState(false);

  // Cargar datos iniciales
  useEffect(() => {
    setClients(getClients());
    setRewards(getRewards());
    setRedemptions(getRedemptions());
  }, []);

  // ── Agregar puntos a un cliente ──────────────────────
  const handleAddPoints = () => {
    if (!selectedClient || !puntosInput || !motivoInput) {
      toast.error('Completá todos los campos');
      return;
    }

    addPoints(selectedClient, puntosInput, motivoInput);
    toast.success('Puntos agregados correctamente');

    // Refrescar lista de clientes para ver los puntos actualizados
    setClients(getClients());
    setPuntosInput(0);
    setMotivoInput('');
  };

  // ── Guardar premio (crear o editar) ─────────────────
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
      // Editar premio existente
      updatedRewards = rewards.map((r) =>
        r.id === rewardForm.id
          ? {
              ...r,
              nombre:           rewardForm.nombre.trim(),
              descripcion:      rewardForm.descripcion.trim(),
              puntosRequeridos: rewardForm.puntosRequeridos,
            }
          : r
      );
      toast.success('Premio actualizado');
    } else {
      // Crear nuevo premio
      const newReward: Reward = {
        id:               Date.now().toString(),
        nombre:           rewardForm.nombre.trim(),
        descripcion:      rewardForm.descripcion.trim(),
        puntosRequeridos: rewardForm.puntosRequeridos,
        activo:           true,
      };
      updatedRewards = [...rewards, newReward];
      toast.success('Premio creado');
    }

    // Guardar en el store (localStorage)
    saveRewards(updatedRewards);
    setRewards(updatedRewards);

    // Limpiar formulario
    setRewardForm(EMPTY_FORM);
    setEditingReward(false);
  };

  // ── Eliminar un premio ───────────────────────────────
  const handleDeleteReward = (id: string) => {
    if (!confirm('¿Eliminar este premio? Los canjes ya realizados no se afectan.')) return;

    const updated = rewards.filter((r) => r.id !== id);
    saveRewards(updated);
    setRewards(updated);
    toast.success('Premio eliminado');
  };

  // ── Empezar a editar un premio ───────────────────────
  const handleEditReward = (reward: Reward) => {
    setRewardForm({
      id:               reward.id,
      nombre:           reward.nombre,
      descripcion:      reward.descripcion,
      puntosRequeridos: reward.puntosRequeridos,
    });
    setEditingReward(true);
  };

  // ── Cancelar edición ─────────────────────────────────
  const handleCancelEdit = () => {
    setRewardForm(EMPTY_FORM);
    setEditingReward(false);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Puntos y premios</h1>
        <p className="page-subtitle">
          Gestioná el programa de fidelización de Mundo Prana
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">

        {/* ── AGREGAR PUNTOS MANUALMENTE ── */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Agregar puntos a un cliente
          </h3>

          <div className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <select
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card mt-1"
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
              >
                <option value="">Seleccionar cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido} — {c.puntos} pts actuales
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Cantidad de puntos</Label>
              <Input
                type="number"
                min={1}
                placeholder="Ej: 5"
                value={puntosInput || ''}
                onChange={(e) => setPuntosInput(Number(e.target.value))}
              />
            </div>

            <div>
              <Label>Motivo</Label>
              <Input
                placeholder="Ej: Bonus por referido, ajuste manual..."
                value={motivoInput}
                onChange={(e) => setMotivoInput(e.target.value)}
              />
            </div>

            <Button onClick={handleAddPoints} className="w-full">
              Agregar puntos
            </Button>
          </div>
        </div>

        {/* ── PREMIOS DISPONIBLES + ABM ── */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Premios canjeables
            </h3>
            {!editingReward && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRewardForm(EMPTY_FORM);
                  setEditingReward(true);
                }}
              >
                <Plus className="w-3 h-3 mr-1" />
                Nuevo
              </Button>
            )}
          </div>

          {/* Formulario crear / editar premio */}
          {editingReward && (
            <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {rewardForm.id ? 'Editar premio' : 'Nuevo premio'}
              </p>

              <div>
                <Label>Nombre del premio</Label>
                <Input
                  placeholder="Ej: 1 vianda gratis"
                  value={rewardForm.nombre}
                  onChange={(e) =>
                    setRewardForm({ ...rewardForm, nombre: e.target.value })
                  }
                />
              </div>

              <div>
                <Label>Descripción (opcional)</Label>
                <Input
                  placeholder="Ej: Una vianda a elección del menú del día"
                  value={rewardForm.descripcion}
                  onChange={(e) =>
                    setRewardForm({ ...rewardForm, descripcion: e.target.value })
                  }
                />
              </div>

              <div>
                <Label>Puntos requeridos para canjear</Label>
                <Input
                  type="number"
                  min={1}
                  value={rewardForm.puntosRequeridos}
                  onChange={(e) =>
                    setRewardForm({
                      ...rewardForm,
                      puntosRequeridos: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveReward}>
                  <Check className="w-3 h-3 mr-1" />
                  Guardar
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  <X className="w-3 h-3 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Lista de premios existentes */}
          <div className="space-y-2">
            {rewards.length === 0 && !editingReward ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay premios configurados. Creá el primero.
              </p>
            ) : (
              rewards.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{r.nombre}</p>
                    {r.descripcion && (
                      <p className="text-xs text-muted-foreground truncate">
                        {r.descripcion}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge variant="secondary">{r.puntosRequeridos} pts</Badge>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleEditReward(r)}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteReward(r.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── ÚLTIMOS CANJES ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Últimos canjes
        </h3>

        {redemptions.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Sin canjes todavía.
          </p>
        ) : (
          <div className="space-y-2">
            {redemptions
              .slice(-10)
              .reverse()
              .map((r) => {
                const client = clients.find((c) => c.id === r.clientId);
                const reward = rewards.find((rw) => rw.id === r.rewardId);
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm"
                  >
                    <span>
                      {client?.nombre} {client?.apellido}
                    </span>
                    <span className="text-muted-foreground">
                      {reward?.nombre ?? 'Premio'} (−{r.puntosUsados} pts)
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}