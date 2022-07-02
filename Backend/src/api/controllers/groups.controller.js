const { join } = require('path')
const { Groups } = require(join(__dirname, '..', 'models', 'Groups.model'))
// const Subject = require(join(__dirname, '..', 'models', 'Subjects.model'))
const User = require(join(__dirname, '..', 'models', 'User.model'))
const RandExp = require('randexp')
const sendEmail = require(join(__dirname, '..', 'workers', 'sendEmail.worker'))

/*
  Type: GET
  Desc: Get All Groups
  Query: subject (if provided, return groups for that subject) (takes the name of the subject as a query param)
  ? should i add a subject model and check if subject exists in it
  Params: None
  Returns: Array of Groups
*/
exports.getAllGroups = async (req, res) => {
  const { subject } = req.query
  const limit = parseInt(req.query.limit) || 10
  const page = parseInt(req.query.page) || 1
  try {
    let groups
    if (subject) {
      groups = await Groups.find({ subject: subject }).limit(limit).skip(limit * (page - 1))
    } else {
      groups = await Groups.find().limit(limit).skip(limit * (page - 1))
    }
    // hide requests
    for (let i = 0; i < groups.length; i++) {
      groups[i] = Object.assign({}, groups[i].toObject(), { isAdmin: false })

      if (groups[i].admin.toString() === req.user.id) {
        groups[i].isAdmin = true
      } else {
        groups[i].admin = undefined
        groups[i].modules = undefined
        groups[i].requests = undefined
        groups[i].members = undefined
      }
    }

    return res.status(200).json({ groups })
  } catch (err) {
    console.log(err)
    return res.status(500).json({ message: 'Server Error' })
  }
}

/*
  Type: GET
  Desc: Request to Join Group
  Auth: Bearer Token
  Query: inviteCode ( the invite code of the group )
  Params: None
  Returns: Success or Error
*/
exports.requestGroup = async (req, res) => {
  const { inviteCode } = req.params

  try {
    // add user to requests array
    // if (!inviteCode) { return res.status(400).json({ message: 'No Invite Code Provided' }) }
    const group = await Groups.findOne({ inviteCode: inviteCode })
    if (!group) { return res.status(400).json({ message: 'Group does not exist' }) }
    const user = req.user
    if (group.members.toString().includes(user.id)) { return res.status(400).json({ message: 'User already in group' }) }

    if (group.requests.toString().includes(user.id)) { return res.status(400).json({ message: 'User already requested to join group' }) }

    group.requests.push(user.id)
    await group.save()

    const admin = await User.findById(group.admin)
    await sendEmail(admin.email, 'Group Request', `${user.name} has requested to join the group ${group.name}`)
    return res.status(200).json({ message: 'Request sent' })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

/*
  Type: GET
  Desc: Get Groups of a User
  Auth: Bearer Token
  Query: id (if specified, the id of the user)
  Params: None
  Returns: Array of Groups
*/
exports.getUserGroups = async (req, res) => {
  const id = req.query.id || req.user.id
  try {
    const groups = await Groups.find({ members: id })
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].admin.toString() === id) {
        if (req.query.id) groups[i].requests = undefined
        groups[i].isAdmin = true
      } else {
        groups[i].isAdmin = false
        groups[i].requests = undefined
      }
    }
    return res.status(200).json({
      groups
    })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

/*
  Type: POST
  Desc: Create Group
  Auth: Bearer Token
  Query: None
  Params: None
  Body: subjectID (the id of the subject), name (the name of the group), description (the description of the group)
  Returns: Group
*/
exports.createGroup = async (req, res) => {
  const { name, description, subject, modules } = req.body
  try {
    // if (!name && !description && !subject && !modules) { return res.status(400).json({ message: 'Invalid Data Provided' }) }
    // const subject = await Subject.findById(subjectID)
    // if (!subject) {
    //   return res.status(400).json({
    //     message: 'Subject does not exist'
    //   })
    // }

    // using JOI to validate data

    // // check modules schema
    // for (let i = 0; i < modules.length; i++) {
    //   // check if module array has name, daysToComplete
    //   modules[i].completedUsers = []
    //   if (!modules[i].name && !modules[i].daysToComplete) { return res.status(400).json({ message: 'Invalid Data Provided' }) }
    // }
    // invite code in the format: xxx-xxx-xxx
    // create random code from 3-3-3

    const inviteCode = new RandExp(/^[a-zA-Z0-9]{3}-[a-zA-Z0-9]{3}-[a-zA-Z0-9]{3}$/).gen()

    const group = new Groups({
      name,
      description,
      inviteCode,
      members: [req.user.id],
      requests: [],
      admin: req.user.id,
      subject,
      quizes: [],
      modules
    })
    await group.save()
    // subject.groups.push(group._id)
    // await subject.save()
    return res.status(200).json({
      group
    })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

/*
  Type: GET
  Desc: Get Group
  Auth: Bearer Token
  Query: None
  Params: id (the id of the group)
  Returns: Group
*/
exports.getGroup = async (req, res) => {
  try {
    let group = await Groups.findById(req.params.id)
    if (!group) {
      return res.status(400).json({
        message: 'Group does not exist'
      })
    }
    group = Object.assign({}, group.toObject(), { isAdmin: false })
    if (group.admin.toString() === req.user.id) {
      group.isAdmin = true
    } else {
      group.requests = undefined
    }

    // check if user is a part of group
    if (!group.members.toString().includes(req.user.id)) {
      group.members = undefined
      group.quizes = undefined
      group.modules = undefined
    }
    return res.status(200).json({
      group
    })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

/*
  Type: GET
  Desc: Accept Request of User that Requested to Join Group
  Auth: Bearer Token
  Query: None
  Params: group (the id of the group), user (the id of the user)
  Body: None
  Returns: Success or Error
*/

exports.acceptRequest = async (req, res) => {
  const { group, user } = req.params
  try {
    const groupObj = await Groups.findById(group)
    if (!groupObj) {
      return res.status(400).json({
        message: 'Group does not exist'
      })
    }
    const userObj = await User.findById(user)
    if (!userObj) { return res.status(400).json({ message: 'User does not exist' }) }

    if (groupObj.members.toString().includes(userObj._id)) { return res.status(400).json({ message: 'User is already in group' }) }

    if (groupObj.admin.toString() !== req.user.id) { return res.status(400).json({ message: 'User is not admin' }) }

    if (!groupObj.requests.toString().includes(userObj._id)) { return res.status(400).json({ message: 'User has not requested to join group' }) }

    groupObj.members.push(userObj._id)
    groupObj.requests = groupObj.requests.filter(id => id.toString() !== userObj._id.toString())
    await groupObj.save()
    await sendEmail(userObj.email, 'Group Request Accepted', `Your request to join the group ${groupObj.name} has been accepted`)
    return res.status(200).json({
      message: 'User added to group'
    })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}

/*
  Type: GET
  Desc: Delete a Request of a User that requested to join a Group
  Auth: Bearer Token
  Query: None
  Params: group (the id of the group), user (the id of the user)
  Body: None
  Returns: Success
*/
exports.rejectRequest = async (req, res) => {
  const { group, user } = req.params
  try {
    const groupObj = await Groups.findById(group)
    if (!groupObj) {
      return res.status(400).json({
        message: 'Group does not exist'
      })
    }
    const userObj = await User.findById(user)
    if (!userObj) {
      return res.status(400).json({
        message: 'User does not exist'
      })
    }
    if (groupObj.admin.toString() !== req.user.id) {
      return res.status(400).json({
        message: 'User is not admin'
      })
    }
    if (!groupObj.requests.includes(userObj._id)) {
      return res.status(400).json({
        message: 'User has not requested to join group'
      })
    }
    groupObj.requests = groupObj.requests.filter(request => request.toString() !== userObj._id.toString())
    await groupObj.save()
    await sendEmail(userObj.email, 'Group Request Deleted', `Your request to join the group ${groupObj.name} has been rejected`)
    return res.status(200).json({
      message: 'User request deleted'
    })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}
/*
  TYPE: GET
  Desc: Get all groups
  Auth: Bearer Token
  Query: None
  Params: group (the id of the group)
  Body: None
  Returns: Array of {id, name, regno}
*/
exports.getRequests = async (req, res) => {
  const { group } = req.params
  try {
    const groupObj = await Groups.findById(group)
    if (!groupObj) {
      return res.status(400).json({
        message: 'Group does not exist'
      })
    }
    if (groupObj.admin.toString() !== req.user.id) {
      return res.status(400).json({
        message: 'User is not admin'
      })
    }
    const arr = []
    let user
    for (let i = 0; i < groupObj.requests.length; i++) {
      user = await User.findById(groupObj.requests[i])
      // id, user
      arr.push({
        id: user.id,
        user: user.name,
        regno: user.regno
      })
    }
    return res.status(200).json({
      requests: arr
    })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
}