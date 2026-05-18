import { defineCollection, z } from 'astro:content';

/**
 * Coleção de documentação. Cada locale tem o mesmo conjunto de slugs.
 * O frontmatter é validado para garantir que toda página tenha
 * categoria, ordem e título.
 */
const docs = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number().int().nonnegative(),
    category: z.enum([
      'getting-started',
      'designing',
      'barcodes',
      'printing',
      'data',
      'files',
      'reliability',
    ]),
    icon: z.string().optional(),
  }),
});

export const collections = { docs };
