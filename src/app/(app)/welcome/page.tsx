import { requireUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/terms";
import { Tour, type TourStep } from "./tour";

const STEPS: Record<string, TourStep[]> = {
  admin: [
    { icon: "🙏", title: "Welcome, Admin", body: "You see everything across all Dhams: books, sales and money. This short tour shows how the app works." },
    { icon: "✅", title: "First, finish the setup", body: "Add your organisation, Dhams, the book list with prices, a Distribution Drive, Dham Managers and Devotees. The Setup Progress page shows what is done and what remains." },
    { icon: "📦", title: "Receive books and send them to Dhams", body: "When books arrive, use Receive Books. Then use Assign Books to Dham to send copies to each Dham. Stock updates automatically." },
    { icon: "📝", title: "Devotees report sales daily", body: "Devotees record how many books they sold. The app calculates the money. Managers review each report and approve it." },
    { icon: "📊", title: "Watch everything from Home", body: "Your Home page shows books available, books sold, money collected, money yet to submit, reports waiting for review and Dhams that need attention." },
  ],
  manager: [
    { icon: "🙏", title: "Welcome, Dham Manager", body: "You look after the books and money of your Dham. You will only ever see your own Dham's information." },
    { icon: "📦", title: "Receive books", body: "When books arrive at your Dham, record them with Receive Books. They are added to your Dham's stock." },
    { icon: "🤲", title: "Give books to devotees", body: "Use Assign Books to give copies to each devotee. They see them on their phone right away." },
    { icon: "📝", title: "Review daily reports", body: "Every evening devotees send their sales. You get a notification. Check the figures and choose Approve, Request Correction or Reject." },
    { icon: "💰", title: "Receive collected money", body: "When devotees hand over money, confirm it in Collected Money. At the end of the day, use Daily Closing to check everything matches." },
  ],
  devotee: [
    { icon: "🙏", title: "Hare Krishna! Welcome", body: "This app helps you keep track of the books given to you, the books you sell and the money you collect. It only takes a few minutes a day." },
    { icon: "📚", title: "See your books", body: "My Books shows every book your Manager gave you, how many you sold and how many you still have." },
    { icon: "📝", title: "Every evening: Submit Today's Sales", body: "Just type how many copies of each book you sold. The app calculates the amount for you — no maths needed." },
    { icon: "💰", title: "Hand over the money", body: "When you give money to your Manager (cash, UPI or bank), record it in Submit Money. You can submit in parts." },
    { icon: "🔔", title: "You'll be told what happens", body: "When your Manager approves your report or receives your money, you get a notification on the bell icon at the top." },
  ],
};

export default async function WelcomePage() {
  const u = await requireUser();
  return (
    <div className="mx-auto max-w-xl py-4">
      <p className="mb-2 text-center text-sm font-semibold text-brand-700">Guided tour</p>
      <h1 className="mb-6 text-center text-2xl font-bold">Hare Krishna, {u.name.split(" ")[0]}! 🙏</h1>
      <Tour steps={STEPS[u.role]} roleTitle={ROLE_LABEL[u.role]} />
    </div>
  );
}
