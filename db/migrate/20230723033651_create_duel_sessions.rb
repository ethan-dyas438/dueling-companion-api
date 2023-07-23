class CreateDuelSessions < ActiveRecord::Migration[7.0]
  def change
    create_table :duel_sessions do |t|
      t.string :duel_id

      t.timestamps
    end
  end
end
