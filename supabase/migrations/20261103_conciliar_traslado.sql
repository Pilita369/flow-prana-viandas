-- Conciliación del saldo trasladado entre dos contratos, en una sola transacción:
-- respalda ambos contratos, fija lo recibido por el destino y anota el cambio en origen y destino.
-- Es idempotente: si el destino ya tiene esa cantidad, no cambia nada ni respalda de nuevo.
-- No toca viandas compradas, importes, pagos ni consumos, y conserva el vínculo saldo_origen_plan_id.
create or replace function public.conciliar_traslado(p_origen uuid, p_destino uuid, p_cantidad integer, p_motivo text default 'conciliación por corrección de consumos')
returns jsonb
language plpgsql
as $$
declare
  o public.plans%rowtype;
  d public.plans%rowtype;
  v_ajustes integer;
  v_consumidas integer;
  v_sobrante integer;
  v_hoy text := to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'DD/MM/YYYY');
  v_origen text;
  v_destino text;
begin
  select * into o from public.plans where id = p_origen for update;
  select * into d from public.plans where id = p_destino for update;
  if o.id is null or d.id is null then raise exception 'Contrato no encontrado'; end if;
  if d.saldo_origen_plan_id is distinct from o.id then raise exception 'El contrato destino no recibió saldo de este contrato'; end if;
  if p_cantidad is null or p_cantidad < 0 then raise exception 'Cantidad inválida'; end if;

  -- Saldo real al cierre del origen, con los mismos datos que usa la aplicación
  select coalesce(sum(greatest(cantidad, 0)), 0) into v_ajustes from public.credit_notes
    where plan_id = o.id and tipo = 'vianda_favor' and not coalesce(anulado, false);
  select coalesce(sum(cantidad), 0) into v_consumidas from public.consumptions
    where plan_id = o.id and status = 'retirado';
  v_sobrante := greatest(o.cantidad_contratada + coalesce(o.saldo_anterior_aplicado, 0) + v_ajustes - coalesce(o.ajuste_inicial_usadas, 0) - v_consumidas, 0);
  if p_cantidad > v_sobrante then
    raise exception 'No se puede trasladar % vianda(s): al cierre quedan %', p_cantidad, v_sobrante;
  end if;

  if coalesce(d.saldo_anterior_aplicado, 0) = p_cantidad then
    return jsonb_build_object('cambio', false, 'antes', p_cantidad, 'despues', p_cantidad, 'sobrante', v_sobrante);
  end if;

  v_origen := to_char(o.fecha_inicio, 'DD/MM/YYYY') || '–' || to_char(o.fecha_fin, 'DD/MM/YYYY');
  v_destino := to_char(d.fecha_inicio, 'DD/MM/YYYY') || '–' || to_char(d.fecha_fin, 'DD/MM/YYYY');

  insert into public.respaldos (motivo, tabla, registro_id, datos) values
    (format('Antes de conciliar el saldo trasladado (%s): %s → %s vianda(s) de %s a %s', p_motivo, d.saldo_anterior_aplicado, p_cantidad, v_origen, v_destino), 'plans', o.id::text, to_jsonb(o)),
    (format('Antes de conciliar el saldo trasladado (%s): %s → %s vianda(s) de %s a %s', p_motivo, d.saldo_anterior_aplicado, p_cantidad, v_origen, v_destino), 'plans', d.id::text, to_jsonb(d));

  update public.plans set
    saldo_anterior_aplicado = p_cantidad,
    observaciones = concat_ws(E'\n', nullif(observaciones, ''),
      format('[%s] Saldo trasladado conciliado: recibidas %s → %s del contrato %s (%s). Compradas e importe sin cambios.', v_hoy, d.saldo_anterior_aplicado, p_cantidad, v_origen, p_motivo))
  where id = d.id;

  update public.plans set
    observaciones = concat_ws(E'\n', nullif(observaciones, ''),
      format('[%s] Saldo trasladado conciliado: trasladadas %s → %s al contrato %s (%s). Saldo al cierre: %s.', v_hoy, d.saldo_anterior_aplicado, p_cantidad, v_destino, p_motivo, v_sobrante))
  where id = o.id;

  return jsonb_build_object('cambio', true, 'antes', d.saldo_anterior_aplicado, 'despues', p_cantidad, 'sobrante', v_sobrante);
end;
$$;
