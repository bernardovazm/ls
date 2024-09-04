new Vue({
  el: "#app",
  data: {
    userID: "",
    userDescription: "",
    otherUserID: "",
    trackedUserIDs: [],
    trackedUsersDescriptions: {},
  },
  created() {
    this.initializeUser();
    this.loadTrackedUsers();
    this.startRelay();
  },
  methods: {
    initializeUser() {
      if (!localStorage.getItem("userID")) {
        const userID = Math.floor(Math.random() * 1000000);
        localStorage.setItem("userID", userID);
      }
      this.userID = localStorage.getItem("userID");
      this.userDescription = localStorage.getItem("userDescription") || "";
    },
    setUserDescription() {
      localStorage.setItem("userDescription", this.userDescription);
    },
    addOtherUserID() {
      if (this.otherUserID && !this.trackedUserIDs.includes(this.otherUserID)) {
        this.trackedUserIDs.push(this.otherUserID);
        localStorage.setItem(
          "trackedUserIDs",
          JSON.stringify(this.trackedUserIDs)
        );
        this.trackedUsersDescriptions[this.otherUserID] = "Carregando...";
        this.otherUserID = "";
        this.loadTrackedUsers();
      }
    },
    loadTrackedUsers() {
      this.trackedUserIDs =
        JSON.parse(localStorage.getItem("trackedUserIDs")) || [];
      this.trackedUserIDs.forEach((id) => {
        this.trackedUsersDescriptions[id] =
          localStorage.getItem(`description_${id}`) || "Nenhuma descrição";
      });
    },
    async startRelay() {
      setInterval(async () => {
        await this.sendDataToBackend();
        await this.receiveDataFromBackend();
      }, 10000);
    },
    async sendDataToBackend() {
      const payload = {
        userID: this.userID,
        description: this.userDescription,
        trackedUserIDs: this.trackedUserIDs,
      };

      await fetch("/api/relayData.php", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
    },
    async receiveDataFromBackend() {
      const response = await fetch("/api/relayData.php");
      const data = await response.json();

      data.trackedUserIDs.forEach((userID) => {
        if (userID !== data.userID) {
          this.trackedUsersDescriptions[userID] = data.description;
          localStorage.setItem(`description_${userID}`, data.description);
        }
      });
    },
  },
});
