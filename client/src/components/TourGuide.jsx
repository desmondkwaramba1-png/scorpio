import { Joyride, STATUS } from 'react-joyride';

export default function TourGuide({ run, setRun }) {
  const steps = [
    {
      target: '[data-tour="products"]',
      title: 'Welcome to your dashboard',
      content: 'Start here to publish a product and manage everything in your shop.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-tour="orders"]',
      title: 'Orders',
      content: 'See what customers bought and keep track of fulfillment.',
    },
    {
      target: '[data-tour="wallet"]',
      title: 'Wallet',
      content: 'Review your available balance and payout activity.',
    },
    {
      target: '[data-tour="settings"]',
      title: 'Settings',
      content: 'Update your storefront and restart this guide whenever you need it.',
    }
  ];

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      localStorage.setItem('scorpio_tour_completed', 'true');
    }
  };

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous={true}
      run={run}
      scrollToFirstStep={true}
      showProgress={true}
      showSkipButton={true}
      steps={steps}
      options={{
        zIndex: 10000,
        primaryColor: 'var(--green-glow)',
        overlayColor: 'rgba(15,17,17,.72)',
        spotlightPadding: 7,
        spotlightRadius: 9,
        targetWaitTimeout: 5000
      }}
      styles={{
        tooltip: {
          backgroundColor: 'var(--surface)',
          borderRadius: 12,
          color: 'var(--ink)',
          boxShadow: 'var(--shadow-3)',
          padding: 0
        },
        tooltipTitle: { color: 'var(--ink)', fontSize: 16, fontWeight: 800 },
        tooltipContent: { color: 'var(--ink-dim)', lineHeight: 1.55, padding: '8px 18px 12px' },
        tooltipFooter: { padding: '0 18px 16px' },
        buttonPrimary: {
          backgroundColor: 'var(--green-glow)',
          borderRadius: 8,
          color: '#fff',
          fontWeight: 700,
          padding: '9px 14px'
        },
        buttonSkip: { color: 'var(--muted)', fontWeight: 700 }
      }}
    />
  );
}
