// Escritor por lotes de Firestore: vacía el lote al llegar a N operaciones O a ~2 MB estimados
// (un lote de 400 artículos grandes pesa varios MB: el simulador se cuelga y Firestore real limita a 10 MiB).
export function crearEscritor(db, { maxOps = 400, maxBytes = 2_000_000 } = {}) {
  let lote = db.batch();
  let ops = 0;
  let bytes = 0;
  const e = { escrituras: 0, commits: 0 };
  async function vaciar() {
    if (!ops) return;
    await lote.commit();
    e.commits++;
    lote = db.batch();
    ops = 0;
    bytes = 0;
  }
  e.set = async (ref, datos, opciones) => {
    const peso = JSON.stringify(datos).length;
    if (ops && (ops >= maxOps || bytes + peso > maxBytes)) await vaciar();
    if (opciones) lote.set(ref, datos, opciones);
    else lote.set(ref, datos);
    ops++;
    bytes += peso;
    e.escrituras++;
  };
  e.vaciar = vaciar;
  return e;
}
