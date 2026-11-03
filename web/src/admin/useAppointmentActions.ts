import { appointmentsApi, useApiMutation } from "../api/hooks";
import { errorMessage } from "../api/client";
import type { Appointment, AppointmentStatus } from "../api/types";
import type { MenuItem } from "../components/MoreMenu";

export function useAppointmentActions(openAppointment: (a?: Appointment) => void) {
  const status = useApiMutation(appointmentsApi.setStatus, [["appointments"], ["slots"], ["clients"]]);
  const set = (id: string, s: AppointmentStatus) => status.mutateAsync({ id, status: s }).catch(err => alert(errorMessage(err)));
  return (a: Appointment): MenuItem[] => {
    const items: MenuItem[] = [];
    if (a.status === "PENDING") items.push({ label: "Confirmar", onClick: () => void set(a.id, "CONFIRMED") });
    if (a.status === "PENDING" || a.status === "CONFIRMED") {
      items.push({ label: "Editar agendamento", onClick: () => openAppointment(a) });
      items.push({ label: "Reagendar", onClick: () => openAppointment(a) });
      items.push({ label: "Marcar como concluído", onClick: () => void set(a.id, "COMPLETED") });
      items.push({ label: "Não compareceu", onClick: () => void set(a.id, "NO_SHOW") });
      items.push({ label: "Cancelar", danger: true, onClick: () => void set(a.id, "CANCELLED") });
    }
    return items;
  };
}
