import type { PlansResponse, SubscriptionPlan } from '@cyclefit/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useMe } from '../App';
import { hapticSuccess } from '../telegram';
import { Button, Card, ErrorState, Spinner } from '../ui';

export default function Paywall() {
  const { refreshMe } = useMe();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<SubscriptionPlan>('quarterly');
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setPlans(await api.plans());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState onRetry={load} />;
  if (!plans) return <Spinner />;

  async function buy() {
    setBuying(true);
    setBuyError(false);
    try {
      const res = await api.checkout(selected);
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      await refreshMe();
      hapticSuccess();
      navigate('/', { replace: true });
    } catch {
      setBuyError(true);
    } finally {
      setBuying(false);
    }
  }

  const monthly = plans.plans.find((p) => p.plan === 'monthly');

  return (
    <div className="px-5 pb-8 fade-in">
      <div className="pt-5 mb-4">
        <Link to="/" className="text-sm font-medium text-peach-500">← Назад</Link>
      </div>

      <h1 className="text-2xl font-bold mb-2">CycleFit Plus</h1>
      <ul className="mb-5 space-y-2">
        {plans.marketingClaims.map((claim) => (
          <li key={claim} className="flex gap-2 text-sm">
            <span className="text-peach-500">✦</span>
            <span>{claim}</span>
          </li>
        ))}
      </ul>

      {plans.paymentsMode === 'stub' && (
        <div className="mb-4 text-center text-xs font-semibold bg-lavender-100 text-lavender-500 rounded-2xl py-2.5 px-4">
          Тестовый режим: оплата не списывается
        </div>
      )}

      <div className="flex flex-col gap-3 mb-5">
        {plans.plans.map((p) => {
          const perMonth = Math.round(p.priceRub / p.periodMonths);
          const isSelected = selected === p.plan;
          return (
            <button
              key={p.plan}
              onClick={() => setSelected(p.plan)}
              className={`text-left p-4 rounded-3xl transition flex items-center justify-between ${
                isSelected ? 'bg-peach-200 ring-2 ring-peach-400' : 'bg-white'
              }`}
            >
              <div>
                <div className="font-bold">{p.title}</div>
                <div className="text-xs text-soft mt-0.5">
                  {p.periodMonths > 1 ? `≈ ${perMonth} ₽/мес` : 'без скидки'}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-lg">{p.priceRub} ₽</div>
                {p.discountPercent > 0 && monthly && (
                  <div className="text-xs font-semibold text-peach-500">−{p.discountPercent}%</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {buyError && (
        <p className="text-sm text-red-400 mb-3 text-center">Не получилось оформить. Попробуй ещё раз.</p>
      )}
      <Button onClick={buy} disabled={buying}>
        {buying ? 'Оформляю…' : 'Оформить'}
      </Button>
      <p className="text-center text-xs text-soft mt-3">
        Подписку можно отменить в любой момент в профиле
      </p>
    </div>
  );
}
