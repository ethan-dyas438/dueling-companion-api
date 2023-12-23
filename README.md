# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

## Add Duel Example

* Note: The playerId is now linked to the connectionId, which could possibly create problems down the road and will need to be extensively tested.

```
{
	"action": "addDuel",
	"payload": {
		"duelId": "1"
	}
}
```

## Join Duel Example

* Requires player A to be set and player B to be unset

```
{
	"action": "joinDuel",
	"payload": {
		"duelId": "1"
	}
}
```

## Update Duel Example

* Requires the connectionId to be equal to player A or player B to be make the update

```
{
	"action": "updateDuel",
	"payload": {
		"duelId": "1",
		"duelData": {
			"extraMonsterTwo": "",
			"playerReady": {
				"A": true,
				"B": true
			},
			"playerLifePoints": {
				"A": 4000,
				"B": 4000
			},
			"currentPlayer": "",
			"playerACards": {},
			"playerBCards": {},
			"extraMonsterOne": ""
		},
	}
}
```

## Delete Duel Example

* A duel can only deleted by the player that created it (ie. Player A)

```
{
	"action": "deleteDuel",
	"payload": {
		"duelId": "1"
	}
}
```
