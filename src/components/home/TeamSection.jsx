import React from 'react';

const TEAM = [
  {
    name: 'Member Name',
    role: 'Co-Founder & Designer',
    bio: 'Passionate about creating beautiful designs that bring ideas to life.',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
  },
  {
    name: 'Member Name',
    role: 'Co-Founder & Operations',
    bio: 'Dedicated to delivering quality products and an exceptional customer experience.',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
  },
];

export default function TeamSection() {
  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">The Team</h2>
        <p className="text-gray-500 mb-12 max-w-xl mx-auto">
          Meet the people behind HC Apparel — a passionate duo bringing creativity and quality together.
        </p>
        <div className="flex flex-col md:flex-row gap-10 justify-center items-center">
          {TEAM.map((member, i) => (
            <div key={i} className="flex flex-col items-center max-w-xs">
              <img
                src={member.image}
                alt={member.name}
                className="w-36 h-36 rounded-full object-cover shadow-lg mb-4 border-4 border-gray-100"
              />
              <h3 className="text-xl font-semibold text-gray-900">{member.name}</h3>
              <p className="text-sm text-blue-600 font-medium mb-2">{member.role}</p>
              <p className="text-gray-500 text-sm leading-relaxed">{member.bio}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}