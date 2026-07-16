import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Star } from 'lucide-react';
import { motion } from 'framer-motion';

const PLACEHOLDER_REVIEWS = [
  { reviewer_name: 'Tasha M.', rating: 5, review_text: 'These halftone files are PERFECT. Clean prints every time on my Prestige DTF system.' },
  { reviewer_name: 'Carlos R.', rating: 5, review_text: 'Bought the patriotic bundle — quality is insane. My customers love the distressed look.' },
  { reviewer_name: 'Jenna L.', rating: 5, review_text: 'HC Apparel is my go-to for DTF designs. Instant download and the files always print beautifully.' },
];

export default function ReviewsSection() {
  const { data: reviews = [] } = useQuery({
    queryKey: ['home-reviews'],
    queryFn: () => base44.entities.Review.filter({ is_active: true }, '-created_date', 6),
  });

  const displayReviews = reviews.length > 0 ? reviews : PLACEHOLDER_REVIEWS;

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-accent text-sm font-bold uppercase tracking-widest mb-1">Happy Customers</p>
          <h2 className="text-3xl font-black text-foreground">What Creators Are Saying</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {displayReviews.slice(0, 3).map((review, i) => (
            <motion.div
              key={i}
              className="bg-white rounded-2xl border p-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="flex mb-3">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} className={`w-4 h-4 ${j < review.rating ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`} />
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">"{review.review_text}"</p>
              <p className="font-bold text-sm text-foreground">— {review.reviewer_name}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}