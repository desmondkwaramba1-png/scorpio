import { Joyride, STATUS } from 'react-joyride';

export default function TourGuide({ run, setRun }) {
  const steps = [
    {
      target: '.wrap',
      content: 'Welcome to your SCORPIO dashboard! This quick guide will help you get around.',
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: 'nav.tabs a[href="/dashboard/products"]',
      content: 'Here you can create and manage your products.',
    },
    {
      target: 'nav.tabs a[href="/dashboard/orders"]',
      content: 'View and fulfill your orders here.',
    },
    {
      target: 'nav.tabs a[href="/dashboard/wallet"]',
      content: 'Check your balance and request payouts.',
    },
    {
      target: 'nav.tabs a[href="/dashboard/settings"]',
      content: 'You can update your profile or restart this guide anytime from Settings.',
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
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: 'var(--green)'
        }
      }}
    />
  );
}
