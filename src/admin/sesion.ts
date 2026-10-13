import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { SIN_PERMISO, mensajeDeError } from "./mensajes";

export type Papel = "admin" | "editor";
export type Sesion = { usuario: User | null; papel: Papel | null; cargando: boolean; error: string | null };

/** Busca el papel de un correo en la lista de autorizados (las claves se comparan en minusculas). */
export function papelDe(usuarios: Record<string, unknown> | undefined, correo: string | null | undefined): Papel | null {
  if (!usuarios || !correo) return null;
  const buscado = correo.trim().toLowerCase();
  for (const [clave, valor] of Object.entries(usuarios)) {
    if (clave.trim().toLowerCase() === buscado && (valor === "admin" || valor === "editor")) return valor;
  }
  return null;
}

const INICIAL: Sesion = { usuario: null, papel: null, cargando: true, error: null };

export function usarSesion(): Sesion {
  const [sesion, setSesion] = useState<Sesion>(INICIAL);

  useEffect(() => {
    if (!auth || !db) {
      setSesion({ usuario: null, papel: null, cargando: false, error: null });
      return;
    }
    const basededatos = db;
    const autenticacion = auth;
    let vigente = true;
    const poner = (s: Sesion) => vigente && setSesion(s);

    const cancelar = onAuthStateChanged(autenticacion, async (usuario) => {
      // Sin sesion, o con el correo aun sin confirmar: la pantalla Entrar se encarga de explicarlo.
      if (!usuario || !usuario.emailVerified) {
        setSesion((anterior) => ({ usuario: null, papel: null, cargando: false, error: usuario ? null : anterior.error }));
        return;
      }
      try {
        const ajustes = await getDoc(doc(basededatos, "ajustes", "global"));
        const papel = papelDe(ajustes.data()?.usuarios, usuario.email);
        if (!papel) {
          await signOut(autenticacion);
          poner({ usuario: null, papel: null, cargando: false, error: SIN_PERMISO });
          return;
        }
        poner({ usuario, papel, cargando: false, error: null });
      } catch (e) {
        const mensaje = mensajeDeError(e);
        if (mensaje === SIN_PERMISO) await signOut(autenticacion).catch(() => {});
        poner({ usuario: null, papel: null, cargando: false, error: mensaje });
      }
    });
    return () => {
      vigente = false;
      cancelar();
    };
  }, []);

  return sesion;
}
