import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Mail, ShieldCheck } from 'lucide-react';

const policySections = [
  {
    id: 'information-we-collect',
    title: '1. Information we collect',
    content: (
      <>
        <p>We collect information you provide, information created when you use the site, and limited information from services that help us operate HC Apparel.</p>
        <ul>
          <li><strong>Account and contact information:</strong> name, email address, phone number, account identifiers, login and account-management information.</li>
          <li><strong>Orders, quotes, and support:</strong> products, colors, sizes, quantities, shipping and billing contact details, delivery address, quote requests, order history, payment status, transaction identifiers, and messages you send us.</li>
          <li><strong>Customer uploads:</strong> artwork, images, print instructions, notes, and other files you submit for custom-printing or order support.</li>
          <li><strong>Marketing preferences:</strong> newsletter subscription status, email preferences, campaign source information, and communications you choose to receive.</li>
          <li><strong>Site and device activity:</strong> IP address, browser and device information, referral and campaign parameters, pages and products viewed, searches, cart activity, checkout activity, and completed purchases.</li>
          <li><strong>Connected social services:</strong> if an authorized HC Apparel administrator connects Pinterest or another publishing service, we may process the connected account or channel identifier, selected board or destination, content, links, publishing instructions, and delivery status needed to perform the requested action. Access credentials are kept server-side and are not shown to storefront users.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use-information',
    title: '2. How we use information',
    content: (
      <ul>
        <li>Provide accounts, carts, wishlists, checkout, order tracking, quotes, custom printing, and customer support.</li>
        <li>Process payments, calculate shipping and tax, fulfill orders, prevent fraud, and maintain transaction records.</li>
        <li>Review customer artwork and prepare approved print or fulfillment work.</li>
        <li>Send service messages and, when you subscribe or otherwise permit it, marketing communications.</li>
        <li>Understand site performance, product interest, campaign attribution, and conversion activity so we can improve HC Apparel.</li>
        <li>Prepare or publish social content only when an authorized administrator selects and approves that action.</li>
        <li>Protect the site, enforce our terms, comply with law, and resolve disputes.</li>
      </ul>
    ),
  },
  {
    id: 'payments',
    title: '3. Payments',
    content: (
      <p>
        Payments are processed through Stripe Checkout. Stripe receives payment and related billing information under its own privacy practices. HC Apparel receives transaction status, payment-method type, and identifiers needed to match the payment to an order, but does not receive or store your full card or bank-account number. You can review the{' '}
        <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">Stripe Privacy Policy <ExternalLink aria-hidden="true" /></a>.
      </p>
    ),
  },
  {
    id: 'service-providers',
    title: '4. When we disclose information',
    content: (
      <>
        <p>We disclose information only as reasonably needed to operate the store, complete a request, protect the business, or comply with law. Recipients may include:</p>
        <ul>
          <li><strong>Supabase and Vercel</strong> for authentication, database, file storage, server functions, and site hosting.</li>
          <li><strong>Stripe</strong> for payment processing and payment-related fraud prevention.</li>
          <li><strong>S&amp;S Activewear and other approved fulfillment providers</strong> for product availability and order fulfillment.</li>
          <li><strong>USPS and other shipping carriers</strong> for shipping rates, delivery, and tracking.</li>
          <li><strong>Brevo</strong> for email delivery and subscriber management when those services are used.</li>
          <li><strong>Google Analytics and Pinterest Tag</strong> when enabled for measurement and marketing attribution.</li>
          <li><strong>Pinterest, Buffer, or another connected social-publishing provider</strong> when an authorized administrator requests a connection or publishing action.</li>
          <li>Professional advisers, regulators, courts, law enforcement, or a successor to the business when disclosure is legally required or reasonably necessary.</li>
        </ul>
        <p>HC Apparel does not sell personal information for monetary payment. We do not disclose full payment credentials to product vendors or social platforms.</p>
      </>
    ),
  },
  {
    id: 'analytics-cookies',
    title: '5. Cookies, analytics, and Pinterest',
    content: (
      <>
        <p>HC Apparel uses browser storage, session identifiers, and similar technologies to keep the site working, remember your cart or session, understand visits, and attribute traffic to marketing campaigns.</p>
        <p>When configured, Google Analytics and the Pinterest Tag may receive device, browser, page, product, campaign, and interaction information. Pinterest explains that its Tag can receive information about visits and purchases from participating sites. You can use browser controls to block or delete cookies, though some account, cart, or checkout features may not work correctly.</p>
        <p>A future Pinterest API connection will be used only for the features an authorized HC Apparel administrator requests, such as selecting a board, preparing a Pin, publishing approved content, or reviewing permitted results. HC Apparel will not ask for a Pinterest password, sell Pinterest API information, or take Pinterest actions without authorization.</p>
        <p>
          Learn more in the{' '}
          <a href="https://policy.pinterest.com/en/privacy-policy" target="_blank" rel="noreferrer">Pinterest Privacy Policy <ExternalLink aria-hidden="true" /></a>.
        </p>
      </>
    ),
  },
  {
    id: 'uploads',
    title: '6. Customer artwork and files',
    content: (
      <p>Artwork and other files you upload are stored so we can review, quote, prepare, fulfill, and support your requested work. Please upload only content you are authorized to use and avoid including sensitive personal information that is not needed for the order. We may share an approved production file with a fulfillment or printing provider when necessary to complete your request.</p>
    ),
  },
  {
    id: 'retention-security',
    title: '7. Retention and security',
    content: (
      <>
        <p>We keep information for as long as reasonably needed to provide the service, maintain accounting and tax records, resolve disputes, protect the site, and meet legal obligations. The period varies by record type. Connected-service credentials are retained only while needed for the authorized connection and should be removed or invalidated when the connection is ended.</p>
        <p>We use reasonable administrative and technical measures intended to protect information. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.</p>
      </>
    ),
  },
  {
    id: 'choices-rights',
    title: '8. Your choices and privacy requests',
    content: (
      <>
        <ul>
          <li>Update available account details through your HC Apparel account.</li>
          <li>Use the unsubscribe link in a marketing email to stop promotional email.</li>
          <li>Use your browser settings to manage cookies and similar technologies.</li>
          <li>Contact us to request access, correction, or deletion of personal information, subject to identity verification and records we must retain.</li>
        </ul>
        <p>Privacy rights vary by location. We will review and respond to a verified request as required by applicable law.</p>
      </>
    ),
  },
  {
    id: 'children',
    title: "9. Children's privacy",
    content: (
      <p>HC Apparel is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal information, contact us so we can review the situation.</p>
    ),
  },
  {
    id: 'changes',
    title: '10. Changes to this policy',
    content: (
      <p>We may update this policy as our store, providers, or legal obligations change. The effective date at the top of this page shows when the current version took effect. Material changes will be communicated in an appropriate way.</p>
    ),
  },
];

export default function PrivacyPolicy() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Privacy Policy | HC Apparel';
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f4ec] text-slate-900">
      <section className="bg-primary px-4 py-12 text-primary-foreground sm:px-6 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1.5 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Public privacy notice
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-primary-foreground/80 sm:text-lg">
            This policy explains how HC Apparel collects, uses, discloses, and protects information when you use ilovehcapparel.net.
          </p>
          <p className="mt-5 text-sm text-primary-foreground/65">Effective October 1, 2026</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[16rem_minmax(0,1fr)] lg:px-8">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-24">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">On this page</p>
          <nav className="mt-4 grid gap-1.5" aria-label="Privacy policy sections">
            {policySections.map(section => (
              <a key={section.id} href={`#${section.id}`} className="rounded-lg px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-[#f7f4ec] hover:text-primary">
                {section.title}
              </a>
            ))}
            <a href="#contact-us" className="rounded-lg px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-[#f7f4ec] hover:text-primary">11. Contact us</a>
          </nav>
        </aside>

        <main className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
          <div className="border-b border-slate-200 pb-7">
            <h2 className="text-2xl font-bold text-primary">About this policy</h2>
            <p className="mt-3 leading-7 text-slate-700">
              This policy applies to the HC Apparel storefront, customer accounts, quote and contact forms, custom-printing uploads, order and payment workflows, analytics, and authorized marketing connections available through <a href="https://www.ilovehcapparel.net" className="break-words">www.ilovehcapparel.net</a>. In this policy, “HC Apparel,” “we,” “us,” and “our” refer to the business operating this website.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {policySections.map(section => (
              <section key={section.id} id={section.id} className="scroll-mt-24 py-7">
                <h2 className="text-xl font-bold text-primary sm:text-2xl">{section.title}</h2>
                <div className="policy-copy mt-4 space-y-4 text-[15px] leading-7 text-slate-700 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_svg]:inline [&_svg]:h-3.5 [&_svg]:w-3.5 sm:text-base">
                  {section.content}
                </div>
              </section>
            ))}

            <section id="contact-us" className="scroll-mt-24 py-7">
              <h2 className="text-xl font-bold text-primary sm:text-2xl">11. Contact us</h2>
              <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-4 sm:p-5">
                <p className="leading-7 text-slate-700">Questions or privacy requests can be sent to HC Apparel at:</p>
                <a href="mailto:support@ilovehcapparel.net" className="mt-3 inline-flex min-h-11 max-w-full items-center gap-2 break-all rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                  support@ilovehcapparel.net
                </a>
              </div>
            </section>
          </div>

          <div className="mt-2 flex flex-col gap-3 border-t border-slate-200 pt-7 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Privacy Policy effective October 1, 2026</p>
            <Link to="/" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
              Return to HC Apparel
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
