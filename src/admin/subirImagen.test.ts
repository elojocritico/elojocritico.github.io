import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("browser-image-compression", () => ({
  default: vi.fn(async (f: File) => new File([new Uint8Array(100)], "comprimida-" + f.name, { type: "image/jpeg" })),
}));
import imageCompression from "browser-image-compression";
import { subirImagen, urlTarjeta, AVISO_PRUEBA, ErrorSubida } from "./subirImagen";

const foto = (nombre = "f.jpg", tipo = "image/jpeg", tam = 50) => new File([new Uint8Array(tam)], nombre, { type: tipo });

beforeEach(() => {
  vi.mocked(imageCompression).mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("subirImagen sin configuración o con el simulador", () => {
  it("sin Cloudinary devuelve una URL data: y el aviso de modo de prueba, sin llamar a internet", async () => {
    vi.stubEnv("PUBLIC_CLOUDINARY_NUBE", "");
    vi.stubEnv("PUBLIC_CLOUDINARY_PRESET", "");
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const r = await subirImagen(foto());
    expect(r.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(r.aviso).toBe(AVISO_PRUEBA);
    expect(AVISO_PRUEBA).toBe("Modo de prueba: la foto no se guarda en internet");
    expect(fetchFalso).not.toHaveBeenCalled();
  });
  it("con el simulador activo no sube aunque haya configuración", async () => {
    vi.stubEnv("PUBLIC_EMULADOR", "1");
    vi.stubEnv("PUBLIC_CLOUDINARY_NUBE", "nube");
    vi.stubEnv("PUBLIC_CLOUDINARY_PRESET", "preset");
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    expect((await subirImagen(foto())).aviso).toBe(AVISO_PRUEBA);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
  it("rechaza lo que no es una foto, en llano", async () => {
    await expect(subirImagen(foto("a.pdf", "application/pdf"))).rejects.toThrow(/no es una foto/);
  });
  it("si la compresión falla usa la foto original", async () => {
    vi.stubEnv("PUBLIC_CLOUDINARY_NUBE", "");
    vi.mocked(imageCompression).mockRejectedValueOnce(new Error("no"));
    expect((await subirImagen(foto())).url).toMatch(/^data:/);
  });
  it("en modo de prueba rechaza fotos que no caben en un artículo", async () => {
    vi.stubEnv("PUBLIC_CLOUDINARY_NUBE", "");
    vi.mocked(imageCompression).mockResolvedValueOnce(new File([new Uint8Array(600 * 1024)], "g.jpg", { type: "image/jpeg" }));
    await expect(subirImagen(foto("g.jpg", "image/jpeg", 5_000_000))).rejects.toBeInstanceOf(ErrorSubida);
  });
});

describe("subirImagen con Cloudinary", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_EMULADOR", "");
    vi.stubEnv("PUBLIC_CLOUDINARY_NUBE", "mi-nube");
    vi.stubEnv("PUBLIC_CLOUDINARY_PRESET", "mi-preset");
  });

  it("comprime y sube sin firma a la carpeta elojocritico", async () => {
    const fetchFalso = vi.fn(async () => ({ ok: true, json: async () => ({ secure_url: "https://res.cloudinary.com/mi-nube/image/upload/v1/elojocritico/x.jpg" }) }));
    vi.stubGlobal("fetch", fetchFalso);
    const r = await subirImagen(foto());
    expect(r).toEqual({ url: "https://res.cloudinary.com/mi-nube/image/upload/v1/elojocritico/x.jpg" });
    expect(imageCompression).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, { method: string; body: FormData }];
    expect(url).toBe("https://api.cloudinary.com/v1_1/mi-nube/image/upload");
    expect(init.method).toBe("POST");
    expect(init.body.get("upload_preset")).toBe("mi-preset");
    expect(init.body.get("folder")).toBe("elojocritico");
    expect(init.body.has("api_key")).toBe(false);
    expect(init.body.has("signature")).toBe(false);
  });
  it("no comprime GIF ni SVG", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ secure_url: "https://res.cloudinary.com/a/image/upload/v1/x.gif" }) })));
    await subirImagen(foto("a.gif", "image/gif"));
    expect(imageCompression).not.toHaveBeenCalled();
  });
  it("explica en llano si no hay conexión o si Cloudinary rechaza la foto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fallo"); }));
    await expect(subirImagen(foto())).rejects.toThrow(/Revisa tu conexión/);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) })));
    await expect(subirImagen(foto())).rejects.toThrow(/No se ha podido subir la foto/);
  });
  it("no acepta una respuesta sin dirección https", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ secure_url: "http://malo/x.jpg" }) })));
    await expect(subirImagen(foto())).rejects.toBeInstanceOf(ErrorSubida);
  });
});

describe("urlTarjeta", () => {
  it("pide a Cloudinary una miniatura 16:9", () => {
    expect(urlTarjeta("https://res.cloudinary.com/n/image/upload/v1/elojocritico/x.jpg")).toBe(
      "https://res.cloudinary.com/n/image/upload/c_fill,ar_16:9,w_640,q_auto,f_auto/v1/elojocritico/x.jpg",
    );
  });
  it("deja igual cualquier otra dirección", () => {
    expect(urlTarjeta("data:image/jpeg;base64,AAA")).toBe("data:image/jpeg;base64,AAA");
    expect(urlTarjeta("/img/a.jpg")).toBe("/img/a.jpg");
  });
});
