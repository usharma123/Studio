import React, { type SVGProps, useId } from "react";
import { cn } from "~/lib/utils";

export type Icon = React.FC<SVGProps<SVGSVGElement>>;

export const GitHubIcon: Icon = (props) => (
  <svg {...props} viewBox="0 0 1024 1024" fill="none">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
      transform="scale(64)"
      fill="currentColor"
    />
  </svg>
);

export const GitIcon: Icon = (props) => (
  <svg {...props} viewBox="0 0 256 256">
    <path
      d="M251.17 116.6 139.4 4.82a16.49 16.49 0 0 0-23.31 0l-23.21 23.2 29.44 29.45a19.57 19.57 0 0 1 24.8 24.96l28.37 28.38a19.61 19.61 0 1 1-11.75 11.06L137.28 95.4v69.64a19.62 19.62 0 1 1-16.13-0.57V94.2a19.61 19.61 0 0 1-10.65-25.73L81.46 39.44 4.83 116.08a16.49 16.49 0 0 0 0 23.32L116.6 251.17a16.49 16.49 0 0 0 23.32 0l111.25-111.25a16.5 16.5 0 0 0 0-23.33"
      fill="#DE4C36"
    />
  </svg>
);

export const JujutsuIcon: Icon = (props) => {
  const groupId = `${useId().replaceAll(":", "")}-jj-a`;

  return (
    <svg {...props} viewBox="0 0 1024 1024">
      <defs>
        <g id={groupId}>
          <path
            d="M380.7 632.3s-14.3 56-50.3 55.5c-12.1-0.2-29-10.9-47.1-26.8-34.2 82.7-98.5 239-108.5 268.6-8.9 26.5 13 52 38.2 56 36.4 5.7 49-18.1 49-18.1s13.6 40.7 37.6 39.7c29.9-1.2 34.6-33 34.6-33s11.4 23.8 26.8 23.2c38.4-1.4 41.7-102.9 43.8-135.6 3.8-57.5 6.3-135.4 7.8-190.1-9 6.7-16.5 10.7-21.3 9.9-16.1-2.7-10.6-49.3-10.6-49.3z"
            fill="#42acde"
          />
          <path
            d="M403.7 75.1c-89.7-0.3-201.5 32.6-200.6 99.6 1.3 87.4 52.2 62.4 41.2 111.2-4.9 21.6-59.9 49.8-65.5 153.8 2.80.7 5.3 1 7.2 1.2 14.20.7 29.9-26.3 29.9-26.3s9.5 38 35 38 50.7-26.3 50.7-26.3 15 30.3 39.6 32c20 1.6 34-8 34-8s0.8 15 14.6 14c13.9-1.2 37.6-27.8 37.6-27.8 16.5 30.3 31.9 21 54.7 5.1 0 0 6.2 26.6 36.8 23.7 6-0.6 12.3-1 18.5-1.5l0.9-11.6c2-58.8-20.4-129.8-50.4-183-21.7-38.7-52.5-83.4-49.6-107.3 3.5-28.3 46.7-28.4 46.7-28.4l-48.5-16 24-37a279.7 279.7 0 0 0-56.8-5.4Z"
            fill="#2f9fdf"
          />
          <path
            d="M215.9 414.6s-15.7 27-30 26.3c-1.8-0.1-4.3-0.5-7-1.2l-0.3 3c-2.3 52 7.7 100.3 29.7 132 35.1 50.7 92.6 112.6 122 113 36.10.6 50.4-55.4 50.4-55.4s-5.5 46.6 10.6 49.3c16 2.6 62.4-46.7 87.9-79.5 15.8-20.5 52-82.3 58.2-138.3-6.20.4-12.4 1-18.5 1.5-30.6 3-36.8-23.7-36.8-23.7-22.8 16-38.2 25.2-54.7-5 0 0-23.7 26.5-37.6 27.6-13.8 1.1-14.6-13.8-14.6-13.8s-14 9.5-34 8c-24.5-1.8-39.6-32.1-39.6-32.1s-25.2 26.3-50.7 26.3c-25.5 0-35-38-35-38z"
            fill="#0e254f"
          />
          <path
            d="M309.5 418.5a1.5 1.5 0 0 0-0.7 0c-0.60.2-1.10.8-1.5 1.8a34.7 34.7 0 0 0 4 16.6c5.5 10.6 12.4 22 23.3 27.6 4 2 8.5 3.5 12.5 3.3a36 36 0 0 0 12.5-2.3c4-2 7.6-3.8 10.8-6.2 6-4.4 7.6-6.5 7.6-9.8 0-3.3-2.7-3.5-7.6-0.5-5 3-14.6 6.1-18.8 6.1-11.2 0-21.2-8-33.1-26.4-4.3-6.6-7.1-9.9-9-10.2zm174 5c-1.2-0.2-2.40.4-3.8 1.7-2.3 2.3-2.7 4-2.6 10.70.5 9 4.8 19.2 11.8 24.6 4.4 3.3 13.2 6 20.4 5.8 6.8-1.1 18.8-6.6 15.3-10.3-2-1.6-5 0.7-9.90.7-10.6 0-15.3-3.4-19.6-9-3.8-5-5.4-8.7-7.2-16.8-1.1-4.6-2.6-7.1-4.4-7.4zm-67.5 2.2a1 1 0 0 0-0.4 0c-0.40.1-0.70.4-1.20.9-2.4 2-2.5 5.1-0.2 12.6a41.4 41.4 0 0 0 25.3 22c7.6 1.7 14.50.6 20.3-2.7 3.8-2.4 5.3-5 4.4-7.3-4.8-2.9-7.7-1-13.3-1A39.5 39.5 0 0 1 424 435c-4.8-5.9-7-9.3-8-9.4zm-199 0.8c-1 0.3-1.4 2.7-1 7.20.3 5.3 1.3 8.2 4 12 3 4.5 11.5 11 14.7 11.7 2.5 1 6.9 2.3 10.7 2.3 3.8 0 8-0.6 11.2-1.3 3.2-0.7 6.8-2 10.3-4l1.3-0.7c4-2.1 8-5.1 10.9-7.9l1.4-1.2c6.3-5.4 9.9-10.7 9.9-14.6 0-2.4-5.3-0.5-14 5-16 9.8-31.1 13.2-40.9 9l-2.2-1.3-8.8-7.7a32.9 32.9 0 0 1-3.6-4.8c-1.4-2.2-2.5-3.4-3.3-3.7a1 1 0 0 0-0.5 0z"
            fill="#71beea"
          />
          <path
            d="M221.6 468.8c-0.5 0-0.80.1-1.10.4-0.30.2-0.50.6-0.6 1.2a10 10 0 0 0 0.6 5.1 55 55 0 0 0 28.3 28.9 42.4 42.4 0 0 0 16.4 2c6.1-0.2 12.3-1.4 16.6-3.4a48.3 48.3 0 0 0 13.7-10.6c0.9-1 1.3-2 1.3-2.3 0-0.6 0-0.9-0.3-1-0.3-0.3-0.7-0.4-1.6-0.4-1.8 0-4.90.8-9.7 2.3-6.2 1.9-12.7 3-18.5 3.1-7.80.2-10.2-0.4-17-3.7-4.5-2.2-12-7.7-17.7-12.8a232 232 0 0 0-7.2-6.3 63 63 0 0 0-2.4-2 12 12 0 0 0-0.7-0.4h-0.1zm214.8 13.6c-0.2 0-0.50.7-0.7 1.8v4a32 32 0 0 0 2.7 9.9 38.5 38.5 0 0 0 49.1 19.3c5.2-2.3 10-6.4 13-10.5 1.4-2.1 2.5-4.3 3-6.20.5-1.90.4-3.6-0.3-4.9-0.4-0.8-0.9-1.4-1.3-1.7-0.3-0.3-0.6-0.3-1-0.2-0.90.2-2.3 1.4-4.3 3.8-5 6.2-12.8 9.5-22.6 9.4-6.2 0-11-1.1-16-4.4-5-3.2-10.4-8.6-18-17.3-0.8-1-1.7-2-2.5-2.4l-1-0.6c-0.1 0-0.2 0 0 0zm-33.6 4.2-0.60.2-1.40.7a53.5 53.5 0 0 0-4 2.5c-8 5.5-15.6 8.3-23.9 8.4-8.3 0-17.2-2.7-28-8.2a42 42 0 0 0-7.3-3c-2-0.5-3.1-0.5-3.6-0.2-0.20.1-0.30.3-0.40.6 0 0.3 0 0.80.2 1.50.4 1.3 1.4 3.1 3.1 5.5 4 5.4 10.5 10.1 19.7 14 9.3 3.9 23.8 3.5 32.4-1a42 42 0 0 0 9.1-6.5c2.6-2.6 4.5-6.5 5.3-9.60.5-1.50.6-3 0.4-3.8 0-0.4-0.2-0.7-0.4-0.9-0.1-0.2-0.3-0.2-0.6-0.2zm-132.5 30.8c-0.3 0-0.4 0-0.50.2l-0.10.5c0 0.50.4 1.7 1.2 3.1a87.3 87.3 0 0 0 13.5 16.2c17 15.6 34.6 20.7 49 14.4a33.3 33.3 0 0 0 19-23c0.4-2 0.1-3.1-0.2-3.5-0.2-0.2-0.5-0.3-1-0.3l-1.70.5a24 24 0 0 0-5.7 4.6c-7.7 8-14.6 12-23 11.4-8.3-0.4-18-5.2-31.7-14.3-5.2-3.4-9.4-6-12.5-7.6a15.5 15.5 0 0 0-6.3-2.2zm109.4 0c-0.2 0-0.3 0-0.50.2-0.1 0-0.30.3-0.40.7a9 9 0 0 0 0 3.3c0.4 2.9 1.6 6.7 3.5 10.3 11 20.5 29.4 30.5 46.8 25.7a37.3 37.3 0 0 0 15.6-10c4.4-4.6 7.4-9.9 7.4-13.8 0-1.3-0.1-2.3-0.4-2.7 0-0.3-0.2-0.4-0.3-0.4h-0.5c-0.6 0-1.50.4-2.7 1.2a57 57 0 0 0-4.7 3.7c-9 7.7-16.9 11.2-25.1 10-8.2-1.3-16.7-7.1-27-17.7a159.8 159.8 0 0 0-10.6-9.8 9.8 9.8 0 0 0-0.9-0.6l-0.2-0.1zm-140.2 43.5c-1 0-1.60.2-1.80.5-0.20.4-0.3 1 0 2.10.8 2.2 3.1 5.6 7.1 9.6a78.2 78.2 0 0 0 27.4 17.9c9.7 3.8 16.7 4.1 23.4 1.1 5.5-2.5 8.4-6.1 8.4-10.4a4 4 0 0 0-0.4-2c-0.3-0.4-0.6-0.6-1-0.7-0.9-0.1-2.50.4-4.6 1.8-2.7 2-6.4 2.3-11.3 1.2-5-1.2-11.3-3.8-19.5-8-8-4-17.5-9-21.3-11-2.9-1.4-5-2-6.4-2.1zm160.1 2.8c-0.6-0.1-1.70.2-3.1 1-1.4 1-3.2 2.3-5.2 4.1a58 58 0 0 1-12.7 8.7c-5.9 2.7-8.6 3.2-18.3 3.2-12.6 0-17.2-1.6-29.9-11.2a21 21 0 0 0-6.4-3.8c-0.5 0-0.5 0-0.70.2-0.20.3-0.3 1-0.3 2 0 2.2 1.5 5.7 3.8 9.2 2.4 3.4 5.7 7 9.2 9.5 8.1 6 14.3 7.8 26.2 7.4a34 34 0 0 0 18.3-4.1 51 51 0 0 0 13.1-9.8c3.8-3.8 6.5-8 7-10.70.4-2 0.4-3.50.2-4.5a2 2 0 0 0-0.5-1 1 1 0 0 0-0.7-0.2zm-2 21.4c-0.5 0-0.6 0-0.80.4-0.20.4-0.3 1.2-0.3 2.4 0 3.2 1.7 7.3 4.4 11 2.7 4 6.3 7.4 10 9.5a35 35 0 0 0 21.3 4.8c11-0.9 17.8-3.4 23.8-12.6 1.5-2.5 2-4.8 1.4-6.7-0.2-0.7-0.4-1.1-0.8-1.4-0.3-0.2-0.6-0.3-1.2-0.3-1 0-2.60.7-4.7 2.1-6 4.3-12 6.1-19.9 6.2-8.8 0-16.3-3-26.2-11-3.6-2.8-6-4.3-7-4.4zM290 605.5c-0.60.3-0.90.5-1 1a9 9 0 0 0 0.1 3.3c1.8 11 13 25 24.4 30.2 8.5 4 20 4 28.5 0 7.7-3.5 16-11.1 19-17.3a25 25 0 0 0 2.2-6.3c0.1-0.70.1-1.3 0-1.6 0-0.4-0.2-0.6-0.4-0.7-0.3-0.2-1.3-0.2-2.80.5-1.60.7-3.6 2-6 4-10 8.2-18.6 12.1-27 11.4-8.6-0.7-16.9-6-26.4-15.9a82.6 82.6 0 0 0-7.6-7.1 10 10 0 0 0-2-1.4c-0.5-0.2-0.8-0.2-1-0.1z"
            fill="#309fdf"
          />
          <path
            d="M290 125.7a61.4 61.4 0 0 0-19 2.3c-19.9 5.7-33.5 15.8-36.5 52.2-3 36.6-18 45.5-20.3 46.7 14.7 26.7 38 24.5 30.1 59-2.4 11-17.6 23.5-32.8 46.5 34-27 56.4-48 99.6-100.5 0 0 39-47.6 25.1-77a52 52 0 0 0-46.1-29.2z"
            fill="#e9f2f1"
          />
          <path
            d="M288.5 120.8c-8.1 0-16.7 1.4-25.6 5.3-22.5 9.9-25 20.3-29.1 37a96.8 96.8 0 0 0-1.4 24.6 178 178 0 0 0-16.5-31.6s-19 19.8-36.5 18.6c-22.9-1.7-34 2-44.8 9.8-25.4 18.5-21.2 43.8-21.2 43.8s17.6-1.8 40.5 1c20.3 2.7 37.4 4.3 61.3 2.6 8.5-0.6 15.8-10 19.3-19 4.5-4 2.9-22 4.8-24.5 3-3.4 8-4.7 10.6-5.2 3.7-0.7 4.3 1.5 4.7 2.8a31 31 0 0 0 60.5-3.2c1-4.4 9-5 15.9-4.5 7 0 0.9 15.9-1.7 22.3-5.4 13.2-24.9 39-24.9 39l124.3-85s-45.8 22-61.5 20c-19.7-2.3-25.7-34.8-43.2-44-9.9-5.1-22-9.6-35.5-9.8zm1.4 9.4a48.2 48.2 0 0 1 40.6 23.5c3.7 7.1 6.2 17-0.3 20.2-7.6 3.7-14.70.7-15.5-2.8a31 31 0 0 0-30.2-24.1 30 30 0 0 0-30.8 27.4c-0.4 5.2-9.1 7.7-12.7 3.7-2.7-3 1.7-16.8 3.7-22 6.2-16.2 27.8-25.7 45.2-26zm5.6 27.8a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm-22 29a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm40 523.4c-2.6-1.8-15.1 23.5-20 59-6.8 49-8.3 63.2-14.2 96-6 32.7-12.6 66.3-13.4 73.7-0.6 4.8-1.7 19-0.6 20.1 3.2 3.3 14.7-31.7 16.8-42 2-10.3 7.7-40.7 14.2-86.9 6.4-46.1 8.5-69.6 13.1-91.5 4.7-22 6.7-26.6 4.2-28.4zm66.3-27c-4.1-1.3-10.5 24.6-13.1 37.8-5.6 28.6-6.2 64-8.4 87a1099 1099 0 0 1-12 87.4c-2.7 15-8 29.4-9.8 44.6-1 9-5.2 26-0.2 27.3 5.2 1.5 15.4-36.5 20-55.7 8.1-32.9 10.7-65.6 14.2-99.3 3.3-30.7 4.6-62.8 6.5-93.60.7-18.5 5.1-34.5 2.8-35.6z"
            fill="#0e254f"
          />
        </g>
      </defs>
      <rect width="1024" height="1024" rx="270" fill="#a7bcd9" />
      <use href={`#${groupId}`} transform="matrix(-1 0 0 1 1024 0)" />
      <use href={`#${groupId}`} />
    </svg>
  );
};

export const GitLabIcon: Icon = (props) => (
  <svg {...props} viewBox="0 0 32 32" fill="none">
    <path
      d="m31.46 12.78-0.04-0.12-4.35-11.35A1.14 1.14 0 0 0 25.940.6c-0.24 0-0.470.1-0.660.24-0.190.15-0.330.36-0.390.6l-2.94 9h-11.9l-2.94-9A1.14 1.14 0 0 0 6.070.58a1.15 1.15 0 0 0-1.140.72L0.58 12.68l-0.050.11a8.1 8.1 0 0 0 2.68 9.34l0.020.010.040.03 6.63 4.97 3.28 2.48 2 1.52a1.35 1.35 0 0 0 1.62 0l2-1.52 3.28-2.48 6.67-5h0.02a8.09 8.09 0 0 0 2.7-9.36Z"
      fill="#E24329"
    />
    <path
      d="m31.46 12.78-0.04-0.12a14.75 14.75 0 0 0-5.86 2.64l-9.55 7.24 6.09 4.6 6.67-5h0.02a8.09 8.09 0 0 0 2.67-9.36Z"
      fill="#FC6D26"
    />
    <path
      d="m9.9 27.14 3.28 2.48 2 1.52a1.35 1.35 0 0 0 1.62 0l2-1.52 3.28-2.48-6.1-4.6-6.07 4.6Z"
      fill="#FCA326"
    />
    <path
      d="M6.44 15.3a14.71 14.71 0 0 0-5.86-2.63l-0.050.12a8.1 8.1 0 0 0 2.68 9.34l0.020.010.040.03 6.63 4.97 6.1-4.6-9.56-7.24Z"
      fill="#FC6D26"
    />
  </svg>
);

export const AzureDevOpsIcon: Icon = (props) => {
  const id = useId().replaceAll(":", "");
  const gradientA = `${id}-azure-a`;
  const gradientB = `${id}-azure-b`;
  const gradientC = `${id}-azure-c`;

  return (
    <svg {...props} viewBox="0 0 96 96">
      <defs>
        <linearGradient
          id={gradientA}
          x1="-1032.17"
          x2="-1059.21"
          y1="145.31"
          y2="65.43"
          gradientTransform="matrix(1 0 0 -1 1075 158)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#114a8b" />
          <stop offset="1" stopColor="#0669bc" />
        </linearGradient>
        <linearGradient
          id={gradientB}
          x1="-1023.73"
          x2="-1029.98"
          y1="108.08"
          y2="105.97"
          gradientTransform="matrix(1 0 0 -1 1075 158)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopOpacity=".3" />
          <stop offset=".07" stopOpacity=".2" />
          <stop offset=".32" stopOpacity=".1" />
          <stop offset=".62" stopOpacity=".05" />
          <stop offset="1" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={gradientC}
          x1="-1027.16"
          x2="-997.48"
          y1="147.64"
          y2="68.56"
          gradientTransform="matrix(1 0 0 -1 1075 158)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#3ccbf4" />
          <stop offset="1" stopColor="#2892df" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientA})`}
        d="M33.34 6.54h26.04l-27.03 80.1a4.15 4.15 0 0 1-3.94 2.81H8.15a4.14 4.14 0 0 1-3.93-5.47L29.4 9.38a4.15 4.15 0 0 1 3.94-2.83z"
      />
      <path
        fill="#0078d4"
        d="M71.17 60.26H29.88a1.91 1.91 0 0 0-1.3 3.31l26.53 24.76a4.17 4.17 0 0 0 2.85 1.13h23.38z"
      />
      <path
        fill={`url(#${gradientB})`}
        d="M33.34 6.54a4.12 4.12 0 0 0-3.95 2.88L4.25 83.92a4.14 4.14 0 0 0 3.91 5.54h20.79a4.44 4.44 0 0 0 3.4-2.9l5.02-14.78 17.91 16.7a4.24 4.24 0 0 0 2.670.97h23.29L71.02 60.26H41.24L59.47 6.55z"
      />
      <path
        fill={`url(#${gradientC})`}
        d="M66.6 9.36a4.14 4.14 0 0 0-3.93-2.82H33.65a4.15 4.15 0 0 1 3.93 2.82l25.18 74.62a4.15 4.15 0 0 1-3.93 5.48h29.02a4.15 4.15 0 0 0 3.93-5.48z"
      />
    </svg>
  );
};

export const BitbucketIcon: Icon = (props) => {
  const id = useId().replaceAll(":", "");
  const gradientId = `${id}-bitbucket-a`;

  return (
    <svg {...props} viewBox="8.4 14.39 2481.29 2231.21">
      <path fill="none" d="M989.97,1493.09h518.05l125.04-730.04H852.22L989.97,1493.09z" />
      <path
        fill="#2684FF"
        d="M88.92,14.4C45.02,13.83,8.97,48.96,8.41,92.86c-0.06,4.61,0.28,9.22,1.02,13.77l337.48,2048.72 c8.68,51.75,53.26,89.8,105.74,90.24h1619.03c39.38,0.5,73.19-27.9,79.49-66.78l337.49-2071.78c7.03-43.34-22.41-84.17-65.75-91.2 c-4.55-0.74-9.15-1.08-13.76-1.02L88.92,14.4z M1509.99,1495.09H993.24l-139.92-731h781.89L1509.99,1495.09z"
      />
      <linearGradient
        id={gradientId}
        gradientUnits="userSpaceOnUse"
        x1="945.1094"
        y1="1524.8389"
        x2="944.4923"
        y2="1524.1893"
        gradientTransform="matrix(1996.6343 0 0 -1480.3047 -1884485.625 2258195)"
      >
        <stop offset="0.18" stopColor="#0052CC" />
        <stop offset="1" stopColor="#2684FF" />
      </linearGradient>
      <path
        fill={`url(#${gradientId})`}
        d="M2379.27,763.06h-745.5l-125.12,730.42H992.31l-609.67,723.67c19.32,16.71,43.96,26,69.5,26.21h1618.13 c39.35,0.51,73.14-27.88,79.44-66.72L2379.27,763.06z"
      />
    </svg>
  );
};

export const CursorIcon: Icon = ({ className, ...props }) => (
  <svg
    {...props}
    viewBox="0 0 466.73 532.09"
    className={cn("fill-[#26251E] dark:fill-[#EDECEC]", className)}
  >
    <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-0.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-0.01Z" />
  </svg>
);

export const GrokIcon: Icon = ({ className, ...props }) => (
  <svg
    {...props}
    viewBox="0 0 24 24"
    fill="none"
    className={cn("fill-[#0F0F0F] dark:fill-[#F5F5F5]", className)}
  >
    <path d="M9.27 15.28L17.25 9.36C17.64 9.07 18.2 9.18 18.38 9.63C19.37 12.01 18.93 14.87 16.98 16.83C15.02 18.8 12.31 19.23 9.83 18.25L7.11 19.51C11 22.18 15.73 21.52 18.68 18.55C21.02 16.2 21.74 12.99 21.07 10.1L21.07 10.1C20.09 5.85 21.31 4.15 23.82 0.68C23.88 0.6 23.94 0.51 24 0.43L20.7 3.75V3.74L9.27 15.29" />
    <path d="M7.62 16.72C4.83 14.04 5.31 9.89 7.69 7.5C9.46 5.73 12.34 5 14.86 6.07L17.57 4.81C17.08 4.46 16.45 4.08 15.74 3.81C12.5 2.47 8.62 3.13 5.98 5.78C3.45 8.33 2.65 12.25 4.02 15.59C5.04 18.09 3.37 19.85 1.68 21.64C1.08 22.27 0.48 22.9 0 23.57L7.62 16.73" />
  </svg>
);

export const TraeIcon: Icon = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="currentColor">
    {/* Back rectangle: left strip + bottom strip drawn separately — empty bottom-left corner is the gap between them */}
    <rect x="1" y="4" width="3" height="14" />
    <rect x="4" y="18" width="18" height="3" />
    {/* Front frame: top bar + right bar only — left and bottom are replaced by the back strips above */}
    <rect x="4" y="4" width="18" height="3" />
    <rect x="19" y="7" width="3" height="11" />
    {/* Two diamonds, offset slightly to the right within the open area */}
    <path d="M11 10L13 12L11 14L9 12Z" />
    <path d="M16 10L18 12L16 14L14 12Z" />
  </svg>
);

export const KiroIcon: Icon = (props) => (
  <svg {...props} viewBox="0 0 1200 1200" fill="none">
    <rect width="1200" height="1200" rx="260" fill="#9046FF" />
    <path
      d="M398.55 818.91C316.32 1001.03 491.48 1046.74 620.67 940.16C658.69 1059.66 801.05 970.47 852.23 877.8C964.79 673.57 919.32 465.36 907.64 422.37C827.64 129.44 427.62 128.95 358.8 423.87C342.65 475.54 342.4 534.18 333.46 595.05C328.99 625.86 325.51 645.49 313.83 677.79C306.87 696.42 297.68 712.82 282.77 740.65C259.92 783.88 269.6 867.11 387.87 823.88L399.05 818.91H398.55Z"
      fill="#fff"
    />
    <path
      d="M636.12 549.35C603.33 549.35 598.36 510.1 598.36 486.74C598.36 465.62 602.09 448.98 609.29 438.29C615.5 428.85 624.7 424.13 636.12 424.13C647.55 424.13 657.49 428.85 664.45 438.54C672.4 449.47 676.62 466.12 676.62 486.74C676.62 526 661.47 549.35 636.38 549.35H636.12Z"
      fill="#000"
    />
    <path
      d="M771.24 549.35C738.45 549.35 733.48 510.1 733.48 486.74C733.48 465.62 737.2 448.98 744.41 438.29C750.62 428.85 759.81 424.13 771.24 424.13C782.67 424.13 792.61 428.85 799.56 438.54C807.52 449.47 811.74 466.12 811.74 486.74C811.74 526 796.59 549.35 771.49 549.35H771.24Z"
      fill="#000"
    />
  </svg>
);

export const VisualStudioCode: Icon = (props) => {
  const id = useId();
  const maskId = `${id}-vscode-a`;
  const topShadowFilterId = `${id}-vscode-b`;
  const sideShadowFilterId = `${id}-vscode-c`;
  const overlayGradientId = `${id}-vscode-d`;

  return (
    <svg {...props} fill="none" viewBox="0 0 100 100">
      <mask id={maskId} width="100" height="100" x="0" y="0" maskUnits="userSpaceOnUse">
        <path
          fill="#fff"
          fillRule="evenodd"
          d="M70.91 99.32a6.22 6.22 0 0 0 4.96-0.19l20.59-9.91A6.25 6.25 0 0 0 100 83.59V16.41a6.25 6.25 0 0 0-3.54-5.63L75.870.87a6.23 6.23 0 0 0-7.1 1.21L29.36 38.04 12.19 25.01a4.16 4.16 0 0 0-5.320.24l-5.51 5.01a4.17 4.17 0 0 00 6.16L16.25 50 1.36 63.58a4.17 4.17 0 0 0 0 6.16l5.51 5.01a4.16 4.16 0 0 0 5.320.24l17.17-13.03L68.77 97.92a6.22 6.22 0 0 0 2.14 1.4ZM75.02 27.3 45.11 50l29.91 22.7V27.3Z"
          clipRule="evenodd"
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path
          fill="#0065A9"
          d="M96.46 10.8 75.860.88a6.23 6.23 0 0 0-7.11 1.21l-67.45 61.5a4.17 4.17 0 0 0 0 6.16l5.51 5.01a4.17 4.17 0 0 0 5.320.24l81.23-61.62c2.73-2.07 6.64-0.12 6.64 3.3v-0.24a6.25 6.25 0 0 0-3.54-5.63Z"
        />
        <g filter={`url(#${topShadowFilterId})`}>
          <path
            fill="#007ACC"
            d="m96.46 89.2-20.6 9.92a6.23 6.23 0 0 1-7.11-1.21l-67.45-61.5a4.17 4.17 0 0 1 0-6.16l5.51-5.01a4.17 4.17 0 0 1 5.32-0.24l81.23 61.62c2.73 2.07 6.640.12 6.64-3.3v0.24a6.25 6.25 0 0 1-3.54 5.63Z"
          />
        </g>
        <g filter={`url(#${sideShadowFilterId})`}>
          <path
            fill="#1F9CF0"
            d="M75.86 99.13a6.23 6.23 0 0 1-7.11-1.21c2.31 2.31 6.250.67 6.25-2.59V4.67c0-3.26-3.94-4.89-6.25-2.59a6.23 6.23 0 0 1 7.11-1.21l20.6 9.91A6.25 6.25 0 0 1 100 16.41v67.17a6.25 6.25 0 0 1-3.54 5.63l-20.6 9.91Z"
          />
        </g>
        <path
          fill={`url(#${overlayGradientId})`}
          fillRule="evenodd"
          d="M70.85 99.32a6.22 6.22 0 0 0 4.96-0.19L96.4 89.22a6.25 6.25 0 0 0 3.54-5.63V16.41a6.25 6.25 0 0 0-3.54-5.63L75.810.87a6.23 6.23 0 0 0-7.1 1.21L29.29 38.04 12.13 25.01a4.16 4.16 0 0 0-5.320.24l-5.51 5.01a4.17 4.17 0 0 00 6.16L16.19 50 1.3 63.58a4.17 4.17 0 0 0 0 6.16l5.51 5.01a4.16 4.16 0 0 0 5.320.24L29.29 61.96l39.41 35.96a6.22 6.22 0 0 0 2.14 1.4ZM74.95 27.3 45.05 50l29.91 22.7V27.3Z"
          clipRule="evenodd"
          opacity=".25"
          style={{ mixBlendMode: "overlay" }}
        />
      </g>
      <defs>
        <filter
          id={topShadowFilterId}
          width="116.727"
          height="92.246"
          x="-8.394"
          y="15.829"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
          <feOffset />
          <feGaussianBlur stdDeviation="4.167" />
          <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend in2="BackgroundImageFix" mode="overlay" result="effect1_dropShadow" />
          <feBlend in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <filter
          id={sideShadowFilterId}
          width="47.917"
          height="116.151"
          x="60.417"
          y="-8.076"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
          <feOffset />
          <feGaussianBlur stdDeviation="4.167" />
          <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend in2="BackgroundImageFix" mode="overlay" result="effect1_dropShadow" />
          <feBlend in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <linearGradient
          id={overlayGradientId}
          x1="49.939"
          x2="49.939"
          y1=".258"
          y2="99.742"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export const VisualStudioCodeInsiders: Icon = (props) => {
  const id = useId();
  const maskId = `${id}-vscode-insiders-a`;
  const topShadowFilterId = `${id}-vscode-insiders-b`;
  const sideShadowFilterId = `${id}-vscode-insiders-c`;
  const overlayGradientId = `${id}-vscode-insiders-d`;

  return (
    <svg {...props} fill="none" viewBox="0 0 100 100">
      <mask id={maskId} width="100" height="100" x="0" y="0" maskUnits="userSpaceOnUse">
        <path
          fill="#fff"
          fillRule="evenodd"
          d="M70.91 99.32a6.22 6.22 0 0 0 4.96-0.19l20.59-9.91A6.25 6.25 0 0 0 100 83.59V16.41a6.25 6.25 0 0 0-3.54-5.63L75.870.87a6.23 6.23 0 0 0-7.1 1.21L29.36 38.04 12.19 25.01a4.16 4.16 0 0 0-5.320.24l-5.51 5.01a4.17 4.17 0 0 00 6.16L16.25 50 1.36 63.58a4.17 4.17 0 0 0 0 6.16l5.51 5.01a4.16 4.16 0 0 0 5.320.24l17.17-13.03L68.77 97.92a6.22 6.22 0 0 0 2.14 1.4ZM75.02 27.3 45.11 50l29.91 22.7V27.3Z"
          clipRule="evenodd"
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path
          fill="#009a7c"
          d="M96.46 10.8 75.860.88a6.23 6.23 0 0 0-7.11 1.21l-67.45 61.5a4.17 4.17 0 0 0 0 6.16l5.51 5.01a4.17 4.17 0 0 0 5.320.24l81.23-61.62c2.73-2.07 6.64-0.12 6.64 3.3v-0.24a6.25 6.25 0 0 0-3.54-5.63Z"
        />
        <g filter={`url(#${topShadowFilterId})`}>
          <path
            fill="#00b294"
            d="m96.46 89.2-20.6 9.92a6.23 6.23 0 0 1-7.11-1.21l-67.45-61.5a4.17 4.17 0 0 1 0-6.16l5.51-5.01a4.17 4.17 0 0 1 5.32-0.24l81.23 61.62c2.73 2.07 6.640.12 6.64-3.3v0.24a6.25 6.25 0 0 1-3.54 5.63Z"
          />
        </g>
        <g filter={`url(#${sideShadowFilterId})`}>
          <path
            fill="#24bfa5"
            d="M75.86 99.13a6.23 6.23 0 0 1-7.11-1.21c2.31 2.31 6.250.67 6.25-2.59V4.67c0-3.26-3.94-4.89-6.25-2.59a6.23 6.23 0 0 1 7.11-1.21l20.6 9.91A6.25 6.25 0 0 1 100 16.41v67.17a6.25 6.25 0 0 1-3.54 5.63l-20.6 9.91Z"
          />
        </g>
        <path
          fill={`url(#${overlayGradientId})`}
          fillRule="evenodd"
          d="M70.85 99.32a6.22 6.22 0 0 0 4.96-0.19L96.4 89.22a6.25 6.25 0 0 0 3.54-5.63V16.41a6.25 6.25 0 0 0-3.54-5.63L75.810.87a6.23 6.23 0 0 0-7.1 1.21L29.29 38.04 12.13 25.01a4.16 4.16 0 0 0-5.320.24l-5.51 5.01a4.17 4.17 0 0 00 6.16L16.19 50 1.3 63.58a4.17 4.17 0 0 0 0 6.16l5.51 5.01a4.16 4.16 0 0 0 5.320.24L29.29 61.96l39.41 35.96a6.22 6.22 0 0 0 2.14 1.4ZM74.95 27.3 45.05 50l29.91 22.7V27.3Z"
          clipRule="evenodd"
          opacity=".25"
          style={{ mixBlendMode: "overlay" }}
        />
      </g>
      <defs>
        <filter
          id={topShadowFilterId}
          width="116.727"
          height="92.246"
          x="-8.394"
          y="15.829"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
          <feOffset />
          <feGaussianBlur stdDeviation="4.167" />
          <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend in2="BackgroundImageFix" mode="overlay" result="effect1_dropShadow" />
          <feBlend in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <filter
          id={sideShadowFilterId}
          width="47.917"
          height="116.151"
          x="60.417"
          y="-8.076"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
          <feOffset />
          <feGaussianBlur stdDeviation="4.167" />
          <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend in2="BackgroundImageFix" mode="overlay" result="effect1_dropShadow" />
          <feBlend in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <linearGradient
          id={overlayGradientId}
          x1="49.939"
          x2="49.939"
          y1=".258"
          y2="99.742"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export const VSCodium: Icon = (props) => {
  const id = useId();
  const gradientId = `${id}-vscodium-gradient`;

  return (
    <svg {...props} viewBox="0 0 100 100">
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          x2="100"
          y1="0"
          y2="100"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#62A0EA" />
          <stop offset="1" stopColor="#1A5FB4" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M48.26 2.27C45.41 4.11 44.58 7.9 46.42 10.74C56.53 26.4 58.92 38.21 57.88 48.55C53.7 68.37 44.6 72.39 36.66 72.39C28.9 72.39 30.97 59.62 36.81 55.88C40.29 53.71 44.75 52.29 48.17 52.29C51.56 52.29 54.31 49.55 54.31 46.17C54.31 42.79 51.56 40.05 48.17 40.05C44.17 40.05 40.25 40.89 36.59 42.32C37.34 38.79 37.61 34.97 36.65 30.92C35.18 24.76 30.95 18.88 23.62 13.18C22.33 12.18 20.7 11.73 19.08 11.93C17.47 12.13 16 12.97 14.99 14.25C12.91 16.92 13.39 20.77 16.07 22.84C22.05 27.49 24.02 30.92 24.7 33.75C25.37 36.58 24.83 39.62 23.48 43.79C21.74 49.41 19.73 54.42 18.85 59.23C18.41 61.6 18.38 64.18 18.27 66.24C13.96 62.04 12.28 56.5 12.28 48.41C12.27 45.03 9.52 42.28 6.13 42.28C2.74 42.290 45.030 48.41C0 59.46 3.23 69.98 11.9 77C19.74 84.47 39.69 81.71 39.69 93.71C39.69 97.1 44.64 98.74 48.03 98.74C51.51 98.74 55.89 96.42 55.89 93.71C55.89 80.1 70.23 71.82 93.85 71.86C97.24 71.86 99.99 69.13 100 65.74C100 62.36 97.26 59.61 93.87 59.61C92.25 59.61 90.68 59.66 89.13 59.75C91.77 53.54 92.94 46.71 92.7 39.32C92.58 35.94 89.75 33.29 86.36 33.4C82.96 33.51 80.31 36.35 80.42 39.73C80.74 49.4 80.37 58.03 73.17 62.58C71.12 63.87 68.74 65 66.48 65C68.24 60.23 69.56 55.2 70.1 49.77C70.45 46.31 70.49 42.2 70.09 39C69.48 34.05 68.74 28.44 70.62 24.21C72.31 20.57 76.09 19.04 81.64 19.04C85.03 19.04 87.78 16.3 87.78 12.92C87.78 9.53 85.03 6.79 81.64 6.79C73.39 6.79 67.13 11.13 63.59 16.38C61.73 12.42 59.48 8.34 56.75 4.11C55.87 2.75 54.48 1.79 52.89 1.44C52.1 1.27 51.29 1.26 50.49 1.4C49.7 1.54 48.94 1.84 48.26 2.27z"
      />
    </svg>
  );
};

export const Zed: Icon = (props) => {
  const id = useId();
  const clipPathId = `${id}-zed-logo-a`;

  return (
    <svg {...props} fill="none" viewBox="0 0 96 96">
      <g clipPath={`url(#${clipPathId})`}>
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M9 6a3 3 0 0 0-3 3v66H0V9a9 9 0 0 1 9-9h80.38c4.01 0 6.02 4.85 3.18 7.68L43.06 57.19H57V51h6v7.69a4.5 4.5 0 0 1-4.5 4.5H37.06L26.74 73.5H73.5V36h6v37.5a6 6 0 0 1-6 6H20.74L10.24 90H87a3 3 0 0 0 3-3V21h6v66a9 9 0 0 1-9 9H6.62c-4.01 0-6.02-4.85-3.18-7.68L52.76 39H39v6h-6v-7.5a4.5 4.5 0 0 1 4.5-4.5h21.26l10.5-10.5H22.5V60h-6V22.5a6 6 0 0 1 6-6h52.76L85.76 6H9Z"
          clipRule="evenodd"
        />
      </g>
      <defs>
        <clipPath id={clipPathId}>
          <path fill="#fff" d="M0 0h96v96H0z" />
        </clipPath>
      </defs>
    </svg>
  );
};

export const OpenAI: Icon = ({ className, ...props }) => (
  <svg
    {...props}
    preserveAspectRatio="xMidYMid"
    viewBox="0 0 256 260"
    className={cn("fill-black dark:fill-white", className)}
  >
    <path d="M239.18 106.2a64.72 64.72 0 0 0-5.58-53.1C219.45 28.46 191 15.78 163.21 21.74A65.59 65.59 0 0 0 52.1 45.22a64.72 64.72 0 0 0-43.23 31.36c-14.31 24.6-11.06 55.63 8.03 76.74a64.67 64.67 0 0 0 5.53 53.1c14.17 24.65 42.64 37.32 70.45 31.36a64.72 64.72 0 0 0 48.75 21.74c28.480.03 53.71-18.36 62.41-45.48a64.77 64.77 0 0 0 43.23-31.36c14.14-24.56 10.88-55.42-8.08-76.48Zm-97.56 136.34a48.4 48.4 0 0 1-31.1-11.25l1.54-0.87 51.67-29.82a8.6 8.6 0 0 0 4.25-7.37v-72.85l21.85 12.64c0.220.110.370.320.410.56v60.37c-0.06 26.82-21.78 48.55-48.6 48.6Zm-104.47-44.61a48.35 48.35 0 0 1-5.78-32.59l1.530.92 51.72 29.83a8.34 8.34 0 0 0 8.44 0l63.18-36.42v25.22a0.870.87 0 0 1-0.360.67l-52.33 30.18c-23.26 13.4-52.97 5.43-66.4-17.8ZM23.55 85.38a48.5 48.5 0 0 1 25.58-21.33v61.39a8.29 8.29 0 0 0 4.2 7.32l62.87 36.27-21.84 12.64a0.820.82 0 0 1-0.77 0L41.35 151.53c-23.21-13.45-31.17-43.14-17.8-66.4v0.26Zm179.47 41.7-63.08-36.63L161.73 77.86a0.820.82 0 0 1 0.77 0l52.23 30.18a48.6 48.6 0 0 1-7.32 87.64v-61.39a8.54 8.54 0 0 0-4.4-7.21Zm21.74-32.69-1.53-0.92-51.62-30.08a8.39 8.39 0 0 0-8.49 0L99.98 99.81V74.59a0.720.72 0 0 1 0.31-0.66l52.23-30.13a48.65 48.65 0 0 1 72.24 50.39v0.21ZM88.06 139.1l-21.84-12.58a0.870.87 0 0 1-0.41-0.61V65.69a48.65 48.65 0 0 1 79.76-37.35l-1.530.87-51.67 29.83a8.6 8.6 0 0 0-4.25 7.37l-0.05 72.7Zm11.87-25.58 28.14-16.22 28.19 16.22v32.43l-28.09 16.22-28.19-16.22-0.05-32.43Z" />
  </svg>
);

export const ClaudeAI: Icon = ({ className, ...props }) => (
  <svg
    {...props}
    preserveAspectRatio="xMidYMid"
    viewBox="0 0 256 257"
    className={cn("fill-[#d97757]", className)}
  >
    <path d="m50.23 170.32 50.36-28.260.84-2.46-0.84-1.36h-2.46l-8.43-0.52-28.77-0.78-24.95-1.04-24.17-1.3-6.09-1.3L0 125.8l0.58-3.76 5.12-3.43 7.320.65 16.2 1.1 24.3 1.69 17.63 1.04 26.12 2.72h4.15l0.58-1.68-1.43-1.04-1.1-1.04-25.15-17.05-27.22-18.02-14.26-10.37-7.71-5.25-3.89-4.92-1.68-10.76 7-7.71 9.40.65 2.40.65 9.53 7.32 20.35 15.75L94.82 91.9l3.89 3.24 1.56-1.10.2-0.78-1.75-2.92-14.45-26.12-15.42-26.57-6.87-11.02-1.81-6.61c-0.65-2.72-1.1-4.99-1.1-7.78l7.97-10.82L71.42 0 82.05 1.43l4.47 3.89 6.61 15.1 10.69 23.79 16.59 32.34 4.86 9.59 2.59 8.880.97 2.72h1.69v-1.56l1.36-18.21 2.53-22.36 2.46-28.780.84-8.1 4.02-9.72 7.97-5.25 6.22 2.98 5.12 7.32-0.71 4.73-3.05 19.77-5.96 30.98-3.89 20.74h2.27l2.59-2.59 10.5-13.93 17.63-22.04 7.78-8.75 9.07-9.66 5.83-4.6h11.02l8.1 12.06-3.63 12.44-11.34 14.39-9.4 12.18-13.48 18.15-8.43 14.520.78 1.17 2.01-0.19 30.46-6.48 16.46-2.98 19.64-3.37 8.88 4.150.97 4.21-3.5 8.62-21 5.18-24.63 4.93-36.68 8.69-0.450.320.520.65 16.53 1.56 7.070.39h17.3l32.21 2.4 8.43 5.57 5.06 6.81-0.84 5.18-12.96 6.61-17.5-4.15-40.83-9.72-14-3.5h-1.94v1.17l11.67 11.41 21.39 19.31 26.77 24.89 1.36 6.16-3.43 4.86-3.63-0.52-23.53-17.69-9.07-7.97-20.54-17.3h-1.36v1.81l4.73 6.94 25.02 37.59 1.3 11.54-1.81 3.76-6.48 2.27-7.13-1.3-14.65-20.54-15.1-23.14-12.18-20.74-1.490.84-7.19 77.45-3.37 3.95-7.78 2.98-6.48-4.92-3.44-7.97 3.44-15.75 4.15-20.54 3.37-16.33 3.05-20.28 1.82-6.74-0.13-0.45-1.490.19-15.29 21-23.27 31.43-18.41 19.7-4.41 1.75-7.65-3.950.71-7.06 4.28-6.29 25.47-32.4 15.36-20.09 9.92-11.6-0.06-1.69h-0.58L44.07 198.13l-12.05 1.56-5.18-4.860.65-7.97 2.46-2.59 20.35-14-0.060.07Z" />
  </svg>
);

export const Gemini: Icon = (props) => (
  <svg {...props} viewBox="0 0 296 298" fill="none">
    <mask
      id="gemini__a"
      width="296"
      height="298"
      x="0"
      y="0"
      maskUnits="userSpaceOnUse"
      style={{ maskType: "alpha" }}
    >
      <path
        fill="#3186FF"
        d="M141.2 4.89c2.28-6.17 11.04-6.07 13.180.15l5.99 17.37a184 184 0 0 0 111.26 113.05l19.3 7c6.14 2.23 6.16 10.910.02 13.16l-19.35 7.08a184 184 0 0 0-109.49 109.39l-7.57 20.63c-2.24 6.11-10.87 6.12-13.130.03l-7.91-21.3a184 184 0 0 0-109.02-108.66l-19.7-7.24c-6.1-2.24-6.12-10.87-0.02-13.13l20.08-7.47A184 184 0 0 0 133.29 26.28l7.91-21.39Z"
      />
    </mask>
    <g mask="url(#gemini__a)">
      <g filter="url(#gemini__b)">
        <ellipse cx="163" cy="149" fill="#3689FF" rx="196" ry="159" />
      </g>
      <g filter="url(#gemini__c)">
        <ellipse cx="33.5" cy="142.5" fill="#F6C013" rx="68.5" ry="72.5" />
      </g>
      <g filter="url(#gemini__d)">
        <ellipse cx="19.5" cy="148.5" fill="#F6C013" rx="68.5" ry="72.5" />
      </g>
      <g filter="url(#gemini__e)">
        <path fill="#FA4340" d="M194 10.5C172 82.5 65.5 134.33 22.5 135L144-66l50 76.5Z" />
      </g>
      <g filter="url(#gemini__f)">
        <path fill="#FA4340" d="M190.5-12.5C168.5 59.5 62 111.33 19 112L140.5-89l50 76.5Z" />
      </g>
      <g filter="url(#gemini__g)">
        <path fill="#14BB69" d="M194.5 279.5C172.5 207.5 66 155.67 23 155l121.5 201 50-76.5Z" />
      </g>
      <g filter="url(#gemini__h)">
        <path fill="#14BB69" d="M196.5 320.5C174.5 248.5 68 196.67 25 196l121.5 201 50-76.5Z" />
      </g>
    </g>
    <defs>
      <filter
        id="gemini__b"
        width="464"
        height="390"
        x="-69"
        y="-46"
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="18" />
      </filter>
      <filter
        id="gemini__c"
        width="265"
        height="273"
        x="-99"
        y="6"
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
      </filter>
      <filter
        id="gemini__d"
        width="265"
        height="273"
        x="-113"
        y="12"
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
      </filter>
      <filter
        id="gemini__e"
        width="299.5"
        height="329"
        x="-41.5"
        y="-130"
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
      </filter>
      <filter
        id="gemini__f"
        width="299.5"
        height="329"
        x="-45"
        y="-153"
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
      </filter>
      <filter
        id="gemini__g"
        width="299.5"
        height="329"
        x="-41"
        y="91"
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
      </filter>
      <filter
        id="gemini__h"
        width="299.5"
        height="329"
        x="-39"
        y="132"
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32" />
      </filter>
    </defs>
  </svg>
);

const ANTIGRAVITY_ICON_DATA_URL =
  "data:image/png;base64,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";

export const AntigravityIcon: Icon = (props) => (
  <svg {...props} viewBox="0 0 128 128" fill="none">
    <image href={ANTIGRAVITY_ICON_DATA_URL} width="128" height="128" />
  </svg>
);

export const OpenCodeIcon: Icon = (props) => (
  <svg {...props} viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clipPath="url(#opencode__clip0_1311_94969)">
      <path className="dark:hidden" d="M24 32H8V16H24V32Z" fill="#CFCECD" />
      <path className="dark:hidden" d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z" fill="#211E1E" />
      <path className="hidden dark:block" d="M24 32H8V16H24V32Z" fill="#4B4646" />
      <path className="hidden dark:block" d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z" fill="#F1ECEC" />
    </g>
    <defs>
      <clipPath id="opencode__clip0_1311_94969">
        <rect width="32" height="40" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

export const GithubCopilotIcon: Icon = ({ className, ...props }) => (
  <svg
    {...props}
    preserveAspectRatio="xMidYMid"
    viewBox="0 0 256 208"
    className={cn("fill-black dark:fill-white", className)}
  >
    <path d="M205.3 31.4c14 14.8 20 35.2 22.5 63.6 6.6 0 12.8 1.5 17 7.2l7.8 10.6c2.2 3 3.4 6.6 3.4 10.4v28.7a12 12 0 0 1-4.8 9.5C215.9 187.2 172.3 208 128 208c-49 0-98.2-28.3-123.2-46.6a12 12 0 0 1-4.8-9.5v-28.7c0-3.8 1.2-7.4 3.4-10.5l7.8-10.5c4.2-5.7 10.4-7.2 17-7.2 2.5-28.4 8.4-48.8 22.5-63.6C77.3 3.2 112.6 0 127.6 0h0.4c14.7 0 50.4 2.9 77.3 31.4ZM128 78.7c-3 0-6.50.2-10.30.6a27.1 27.1 0 0 1-6 12.1 45 45 0 0 1-32 13c-6.8 0-13.9-1.5-19.7-5.2-5.5 1.9-10.8 4.5-11.2 11-0.5 12.2-0.6 24.5-0.6 36.8 0 6.1 0 12.3-0.2 18.5 0 3.6 2.2 6.9 5.5 8.4C79.9 185.9 105 192 128 192s48-6 74.5-18.1a9.4 9.4 0 0 0 5.5-8.4c0.3-18.4 0-37-0.8-55.3-0.4-6.6-5.7-9.1-11.2-11-5.8 3.7-13 5.1-19.7 5.1a45 45 0 0 1-32-12.9 27.1 27.1 0 0 1-6-12.1c-3.4-0.4-6.9-0.5-10.3-0.6Zm-27 44c5.8 0 10.5 4.6 10.5 10.4v19.2a10.4 10.4 0 0 1-20.8 0V133c0-5.8 4.6-10.4 10.4-10.4Zm53.4 0c5.8 0 10.4 4.6 10.4 10.4v19.2a10.4 10.4 0 0 1-20.8 0V133c0-5.8 4.7-10.4 10.4-10.4Zm-73-94.4c-11.2 1.1-20.6 4.8-25.4 10-10.4 11.3-8.2 40.1-2.2 46.2A31.2 31.2 0 0 0 75 91.7c6.8 0 19.6-1.5 30.1-12.2 4.7-4.5 7.5-15.7 7.2-27-0.3-9.1-2.9-16.7-6.7-19.9-4.2-3.6-13.6-5.2-24.2-4.3Zm69 4.3c-3.8 3.2-6.4 10.8-6.7 19.9-0.3 11.3 2.5 22.5 7.2 27a41.7 41.7 0 0 0 30 12.2c8.9 0 17-2.9 21.3-7.2 6-6.1 8.2-34.9-2.2-46.3-4.8-5-14.2-8.8-25.4-9.9-10.6-1-20 0.7-24.2 4.3ZM128 56c-2.6 0-5.60.2-9 0.50.4 1.70.5 3.70.7 5.7 0 1.5 0 3-0.2 4.5 3.2-0.3 6-0.3 8.5-0.3 2.6 0 5.3 0 8.50.3-0.2-1.6-0.2-3-0.2-4.50.2-2 0.3-4 0.7-5.7-3.4-0.3-6.4-0.5-9-0.5Z" />
  </svg>
);

export const ACPRegistryIcon: Icon = ({ className, ...props }) => (
  <svg
    {...props}
    viewBox="0 0 576 220"
    fill="none"
    className={cn("fill-black dark:fill-white", className)}
  >
    <path d="M568 115.82L517.28 27.97C507.18 10.48 489.08 0.02 468.89 0.02C448.73 0.02 430.67 10.44 420.56 27.88L343.25 161.75H242.76C236.23 161.75 230.39 158.38 227.14 152.75C223.86 147.11 223.86 140.38 227.14 134.72L277.86 46.86C281.11 41.22 286.96 37.83 293.48 37.83C300.01 37.83 305.83 41.2 309.1 46.86L312.13 52.09C313.35 54.2 315.6 55.5 318.04 55.5C320.47 55.5 322.74 54.18 323.95 52.07L337.39 28.51C338.8 26.03 338.52 22.94 336.7 20.76C325.7 7.57 309.87 0 293.32 0C292.66 0 292 0 291.32 0.05C272.04 0.75 254.76 11.19 245.07 27.94L200.22 105.66L155.81 29.15C145.47 11.21 126.59 0.02 106.61 0.02C105.95 0.02 105.29 0.02 104.61 0.07C85.33 0.77 68.05 11.21 58.36 27.97L7.66 115.82C-6.26 139.9 -0.87 168.82 21.05 187.76C29.89 195.42 41.6 199.63 54.02 199.63H148.65C151.08 199.63 153.33 198.33 154.56 196.22L168.52 172.03C169.75 169.91 169.75 167.32 168.52 165.21C167.29 163.09 165.04 161.79 162.61 161.79H56.04C49.52 161.79 43.67 158.43 40.42 152.79C37.15 147.15 37.15 140.42 40.42 134.76L91.15 46.91C94.4 41.27 100.24 37.88 106.77 37.88C113.29 37.88 119.11 41.24 122.39 46.91L194.83 172.53C195.03 172.89 195.26 173.21 195.53 173.53C198.76 178.67 202.83 183.49 207.79 187.78C216.63 195.44 228.34 199.65 240.75 199.65H321.42L315.58 209.77C314.35 211.88 314.35 214.48 315.58 216.59C316.81 218.7 319.06 220 321.49 220H349.44C351.87 220 354.12 218.7 355.35 216.59L364.4 200.9L367.17 196.47C367.17 196.47 367.26 196.33 367.28 196.26L453.27 46.93C456.53 41.29 462.37 37.9 468.89 37.9C475.42 37.9 481.26 41.27 484.51 46.93L535.24 134.78C538.49 140.42 538.51 147.17 535.24 152.81C531.99 158.45 526.15 161.84 519.62 161.84H418.67C416.24 161.84 413.99 163.14 412.76 165.25L398.77 189.44C397.55 191.56 397.55 194.15 398.77 196.26C400 198.38 402.25 199.67 404.69 199.67H518.21C539.81 199.67 559.29 188.24 569.03 169.84C578.05 152.79 577.67 132.62 567.98 115.84L568 115.82Z" />
  </svg>
);

export const PiAgentIcon: Icon = ({ className, ...props }) => (
  <svg {...props} viewBox="0 0 800 800" className={cn("fill-none", className)}>
    <rect width="800" height="800" rx="160" fill="#000" />
    <path
      fill="#fff"
      fillRule="evenodd"
      d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
    />
    <path fill="#fff" d="M517.36 400H634.72V634.72H517.36Z" />
  </svg>
);
