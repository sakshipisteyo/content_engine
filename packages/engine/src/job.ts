/** Build a validated Brief from an ad-type Template + a few user inputs (the Create flow). */
import { BriefSchema, type Brief, type Platform, type Template } from "./schemas";

export interface JobInputs {
  id: string;
  brand: string;
  products: string[];
  style_anchor: string;
  hook: string;
  cta: string;
  angle?: string;
  platform?: Platform;
  variants?: number;
  credit_cap?: number;
  product_image?: string;
}

export function jobFromTemplate(template: Template, inputs: JobInputs): Brief {
  const brief: Brief = {
    id: inputs.id,
    brand: inputs.brand,
    format: template.format,
    platform: inputs.platform ?? template.platform,
    hook: inputs.hook,
    angle: inputs.angle?.trim() ? inputs.angle.trim() : template.name,
    cta: inputs.cta,
    products: inputs.products,
    style_anchor: inputs.style_anchor,
    variants: inputs.variants ?? template.default_variants,
    credit_cap: inputs.credit_cap ?? template.default_credit_cap,
    template: template.key,
    ...(inputs.product_image ? { product_image: inputs.product_image } : {}),
  };
  return BriefSchema.parse(brief);
}
