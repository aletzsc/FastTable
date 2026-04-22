/** Tipos mínimos alineados con `supabase/01_reconstruir_db.sql`. */
export type Database = {
  public: {
    Tables: {
      perfiles: {
        Row: {
          id: string;
          nombre_completo: string | null;
          telefono: string | null;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: {
          id: string;
          nombre_completo?: string | null;
          telefono?: string | null;
        };
        Update: {
          nombre_completo?: string | null;
          telefono?: string | null;
        };
      };
      personal: {
        Row: {
          id: string;
          id_usuario: string;
          nombre_visible: string;
          rol: 'anfitrion' | 'mesero' | 'gerente' | 'cocina';
          codigo_empleado: string | null;
          activo: boolean;
          creado_en: string;
          actualizado_en: string;
        };
      };
      zonas: {
        Row: {
          id: string;
          nombre: string;
          orden: number;
          creado_en: string;
        };
      };
      mesas: {
        Row: {
          id: string;
          codigo: string;
          id_zona: string | null;
          capacidad: number;
          estado: 'libre' | 'ocupada' | 'reservada';
          notas: string | null;
          descripcion_publica: string | null;
          imagen_url: string | null;
          id_personal_atendiendo: string | null;
          actualizado_en: string;
        };
      };
      fila_espera: {
        Row: {
          id: string;
          id_usuario: string | null;
          nombre_cliente: string | null;
          personas_grupo: number;
          estado: 'esperando' | 'sentado' | 'cancelado';
          nota: string | null;
          minutos_espera_estimados: number | null;
          unido_en: string;
          sentado_en: string | null;
          cancelado_en: string | null;
          id_mesa_asignada: string | null;
        };
        Insert: {
          id_usuario?: string | null;
          nombre_cliente?: string | null;
          personas_grupo: number;
          estado?: 'esperando' | 'sentado' | 'cancelado';
          nota?: string | null;
          minutos_espera_estimados?: number | null;
          id_mesa_asignada?: string | null;
        };
      };
      categorias_menu: {
        Row: {
          id: string;
          nombre: string;
          orden: number;
          creado_en: string;
        };
      };
      items_menu: {
        Row: {
          id: string;
          id_categoria: string;
          nombre: string;
          descripcion: string | null;
          precio_centavos: number;
          disponible: boolean;
          imagen_url: string | null;
          alergenos_json: unknown;
          creado_en: string;
          actualizado_en: string;
        };
      };
      pedidos_cocina: {
        Row: {
          id: string;
          id_mesa: string;
          id_usuario: string;
          id_item_menu: string;
          cantidad: number;
          nota_cliente: string | null;
          estado: 'pendiente' | 'listo';
          creado_en: string;
          listo_en: string | null;
        };
      };
      reportes_problema: {
        Row: {
          id: string;
          id_usuario: string;
          nombre_usuario: string | null;
          titulo: string;
          descripcion: string;
          estado: 'abierto' | 'revisado' | 'cerrado';
          creado_en: string;
          actualizado_en: string;
        };
        Insert: {
          id_usuario: string;
          nombre_usuario?: string | null;
          titulo: string;
          descripcion: string;
          estado?: 'abierto' | 'revisado' | 'cerrado';
        };
        Update: {
          nombre_usuario?: string | null;
          titulo?: string;
          descripcion?: string;
          estado?: 'abierto' | 'revisado' | 'cerrado';
        };
      };
      solicitudes_servicio: {
        Row: {
          id: string;
          id_mesa: string | null;
          id_usuario: string | null;
          mensaje: string | null;
          estado: 'abierta' | 'reconocida' | 'cerrada';
          id_personal_asignado: string | null;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: {
          id_mesa?: string | null;
          id_usuario?: string | null;
          mensaje?: string | null;
          estado?: 'abierta' | 'reconocida' | 'cerrada';
        };
      };
      reservas_mesa: {
        Row: {
          id: string;
          id_usuario: string;
          id_mesa: string;
          fecha_hora_reserva: string;
          personas_grupo: number;
          nota: string | null;
          ciclo: 'activa' | 'cancelada' | 'completada';
          comensal_llego: boolean | null;
          mesero_atender_a_partir_de: string;
          creado_en: string;
        };
      };
    };
    Enums: {
      estado_mesa: 'libre' | 'ocupada' | 'reservada';
      estado_fila: 'esperando' | 'sentado' | 'cancelado';
      estado_solicitud: 'abierta' | 'reconocida' | 'cerrada';
      rol_personal: 'anfitrion' | 'mesero' | 'gerente' | 'cocina';
      ciclo_reserva: 'activa' | 'cancelada' | 'completada';
      estado_pedido_cocina: 'pendiente' | 'listo';
    };
  };
};
