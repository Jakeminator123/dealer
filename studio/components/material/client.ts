// The view's two calls to the lab server: what is what (GET /api/media) and adding a picture (POST /api/media). Errors
// are lib/api.ts's ApiError with a short Swedish message. In the online copy nothing is added: refused before it leaves.
import { ApiError, SNAPSHOT_REFUSAL } from "../../lib/api.ts";
import { labUrl } from "../../lib/lab.ts";
import { UPLOAD_LIMIT, type Entry, type MediaAnswer, type UploadRole } from "../../lib/media.ts";
import { isSnapshot } from "../../lib/mode.ts";

const kind = (status: number) => (status === 409 ? "conflict" : status === 404 ? "missing" : status === 403 || status === 413 || status === 415 ? "refused" : status >= 500 ? "server" : "invalid");

async function errorOf(response: Response, what: string): Promise<ApiError> {
  let said = "";
  try {
    said = String((await response.json())?.error ?? "");
  } catch {}
  return new ApiError(said || `${what} gick inte (${response.status}).`, response.status, kind(response.status));
}

/** What is what per dealer, as the lab finds it now. */
export async function getMedia(): Promise<MediaAnswer> {
  let response: Response;
  try {
    response = await fetch(labUrl("api/media"), { cache: "no-store" });
  } catch {
    throw new ApiError(isSnapshot ? "Kopian svarar inte. Ladda om sidan." : "Labbet svarar inte. Starta det med START.cmd.", 0, "network");
  }
  if (!response.ok) {
    if (response.status === 404) throw new ApiError(isSnapshot ? "Materialet finns bara i labbet, inte i kopian." : "Labbet känner inte vyn Material än: labbservern behöver startas om.", 404, "missing");
    throw await errorOf(response, "Materialet");
  }
  return (await response.json()) as MediaAnswer;
}

export type Added = { entry: Entry; revision: string };

/** Adds a picture on Jakob's click: the file itself as the body, the rest in headers (encoded: they may hold å, ä, ö). */
export async function addPicture(file: File, input: { dealer: string; role: UploadRole; name: string; title: string }): Promise<Added> {
  if (isSnapshot) throw new ApiError(SNAPSHOT_REFUSAL, 403, "refused");
  if (file.type !== "image/png" && file.type !== "image/jpeg") throw new ApiError("Bara PNG eller JPEG.", 415, "refused");
  if (file.size > UPLOAD_LIMIT) throw new ApiError(`Bilden är för stor (högst ${UPLOAD_LIMIT / 1048576} MB).`, 413, "refused");
  let response: Response;
  try {
    response = await fetch(labUrl("api/media"), {
      method: "POST",
      headers: {
        "content-type": file.type,
        "x-media-dealer": input.dealer,
        "x-media-role": input.role,
        "x-media-name": input.name,
        "x-media-title": encodeURIComponent(input.title),
        "x-media-filename": encodeURIComponent(file.name),
      },
      body: file,
    });
  } catch {
    throw new ApiError("Labbet svarar inte. Starta det med START.cmd.", 0, "network");
  }
  if (!response.ok) {
    if (response.status === 404 || response.status === 405) throw new ApiError("Labbet kan inte ta emot bilder än: labbservern behöver startas om.", response.status, "missing");
    throw await errorOf(response, "Bilden");
  }
  return (await response.json()) as Added;
}
