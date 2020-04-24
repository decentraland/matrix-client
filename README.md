# Decentraland Social Client

Welcome to the Social Client library. This client can be used to interact Decentraland's users, providing the ability to send private messages and add people as friends.

## Installation

```bash
npm install dcl-social-client
```

## Usage

You can check the entire API [here](src/SocialAPI.ts).

## Behind the curtains

In order to provide reliable communication between users, this client connects to a [Matrix](https://matrix.org/) server. In particular, we are using the [Matrix JS SDK](https://github.com/matrix-org/matrix-js-sdk), since it provides easy ways to send messages of all kinds, raise events, and much more.
